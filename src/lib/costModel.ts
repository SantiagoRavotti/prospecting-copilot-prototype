// Future operating-cost estimator. Pure local math over src/data/pricing.json.
// Pricing estimates must be verified before production implementation.

import pricing from '../data/pricing.json';

export const PRICING = pricing;

export interface CostAssumptions {
  runsPerMonth: number;
  candidatesPerRun: number;
  searchesPerCandidate: number;
  inputTokensPerCandidate: number;
  outputTokensPerCandidate: number;
  /** Percentage 0–100 processed with the low-cost model. */
  lowCostModelPercent: number;
  /** Percentage 0–100 processed with the more capable model. */
  capableModelPercent: number;
  useBatchApi: boolean;
  databasePlanId: string;
  hostingPlanId: string;
  enrichmentProviderId: string;
  emailVerificationsPerMonth: number;
  /** Safety margin percentage, e.g. 20 for +20%. */
  safetyMarginPercent: number;
}

export const DEFAULT_ASSUMPTIONS: CostAssumptions = {
  runsPerMonth: 20,
  candidatesPerRun: 100,
  searchesPerCandidate: 2,
  inputTokensPerCandidate: 6000,
  outputTokensPerCandidate: 1200,
  lowCostModelPercent: 90,
  capableModelPercent: 10,
  useBatchApi: true,
  databasePlanId: 'free',
  hostingPlanId: 'hobby',
  enrichmentProviderId: 'none',
  emailVerificationsPerMonth: 0,
  safetyMarginPercent: 20,
};

export const BUDGET_LIMIT_EUR = 100;

export interface CostBreakdown {
  candidatesPerMonth: number;
  aiEur: number;
  searchEur: number;
  databaseEur: number;
  hostingEur: number;
  enrichmentEur: number;
  subtotalEur: number;
  marginEur: number;
  totalEur: number;
  costPerCandidateEur: number;
  budgetRemainingEur: number;
  overBudget: boolean;
  mainDriver: string;
  suggestions: string[];
}

function usdToEur(usd: number): number {
  return usd * pricing.usdToEur;
}

export function estimateCosts(a: CostAssumptions): CostBreakdown {
  const candidatesPerMonth = Math.max(0, a.runsPerMonth) * Math.max(0, a.candidatesPerRun);

  // AI cost: split candidates between the two model tiers.
  const lowShare = Math.max(0, Math.min(100, a.lowCostModelPercent)) / 100;
  const capableShare = Math.max(0, Math.min(100, a.capableModelPercent)) / 100;
  const low = pricing.aiModels.low;
  const capable = pricing.aiModels.capable;
  const lowIn = a.useBatchApi ? low.batchInputUsdPerMTok : low.inputUsdPerMTok;
  const lowOut = a.useBatchApi ? low.batchOutputUsdPerMTok : low.outputUsdPerMTok;
  const capIn = a.useBatchApi ? capable.batchInputUsdPerMTok : capable.inputUsdPerMTok;
  const capOut = a.useBatchApi ? capable.batchOutputUsdPerMTok : capable.outputUsdPerMTok;
  const perCandidateLowUsd =
    (a.inputTokensPerCandidate / 1_000_000) * lowIn +
    (a.outputTokensPerCandidate / 1_000_000) * lowOut;
  const perCandidateCapableUsd =
    (a.inputTokensPerCandidate / 1_000_000) * capIn +
    (a.outputTokensPerCandidate / 1_000_000) * capOut;
  const aiUsd =
    candidatesPerMonth * (lowShare * perCandidateLowUsd + capableShare * perCandidateCapableUsd);

  // Search cost.
  const searchesPerMonth = candidatesPerMonth * Math.max(0, a.searchesPerCandidate);
  const searchUsd = (searchesPerMonth / 1000) * pricing.searchUsdPer1000;

  // Fixed plans.
  const dbPlan = pricing.databasePlans.find((p) => p.id === a.databasePlanId);
  const hostPlan = pricing.hostingPlans.find((p) => p.id === a.hostingPlanId);
  const enrichment = pricing.enrichmentProviders.find((p) => p.id === a.enrichmentProviderId);
  const databaseUsd = dbPlan?.usdPerMonth ?? 0;
  const hostingUsd = hostPlan?.usdPerMonth ?? 0;
  let enrichmentUsd = enrichment?.usdPerMonth ?? 0;
  if (enrichment && enrichment.usdPerVerification > 0) {
    const included =
      'includedVerifications' in enrichment ? (enrichment.includedVerifications ?? 0) : 0;
    const extra = Math.max(0, a.emailVerificationsPerMonth - included);
    enrichmentUsd += extra * enrichment.usdPerVerification;
  }

  const aiEur = usdToEur(aiUsd);
  const searchEur = usdToEur(searchUsd);
  const databaseEur = usdToEur(databaseUsd);
  const hostingEur = usdToEur(hostingUsd);
  const enrichmentEur = usdToEur(enrichmentUsd);
  const subtotalEur = aiEur + searchEur + databaseEur + hostingEur + enrichmentEur;
  const marginEur = subtotalEur * (Math.max(0, a.safetyMarginPercent) / 100);
  const totalEur = subtotalEur + marginEur;

  const drivers: [string, number][] = [
    ['AI (Anthropic)', aiEur],
    ['Web search', searchEur],
    ['Database', databaseEur],
    ['Hosting', hostingEur],
    ['Email enrichment', enrichmentEur],
  ];
  drivers.sort((x, y) => y[1] - x[1]);
  const mainDriver = subtotalEur > 0 ? drivers[0]![0] : 'None';

  const suggestions: string[] = [];
  if (!a.useBatchApi) suggestions.push('Enable the Batch API (50% discount on AI tokens).');
  if (a.capableModelPercent > 15)
    suggestions.push('Reduce the capable-model share to 10–15% of candidates.');
  if (a.searchesPerCandidate > 1.5)
    suggestions.push('Cache company research — one research pass per company, not per person.');
  if (a.inputTokensPerCandidate > 8000)
    suggestions.push('Trim research context per candidate (prompt caching for shared context).');
  if (databaseEur > 0) suggestions.push('The free Postgres tier covers MVP volume — downgrade.');
  if (enrichmentEur > 0)
    suggestions.push('Disable bulk email enrichment; enable it per-prospect on demand only.');
  if (a.candidatesPerRun > 100)
    suggestions.push('Cap candidates per run at 100 to bound worst-case spend.');
  if (suggestions.length === 0)
    suggestions.push('Configuration already follows the lean-MVP guardrails.');

  return {
    candidatesPerMonth,
    aiEur,
    searchEur,
    databaseEur,
    hostingEur,
    enrichmentEur,
    subtotalEur,
    marginEur,
    totalEur,
    costPerCandidateEur: candidatesPerMonth > 0 ? totalEur / candidatesPerMonth : 0,
    budgetRemainingEur: BUDGET_LIMIT_EUR - totalEur,
    overBudget: totalEur > BUDGET_LIMIT_EUR,
    mainDriver,
    suggestions,
  };
}
