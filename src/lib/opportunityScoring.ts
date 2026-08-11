// Explainable match scoring for opportunities (0–100, "Demo score").
// A local heuristic labeled as prototype analysis — not AI output.
// Weights are fixed in the prototype; the MVP exposes them as configuration.

import type {
  MatchFactor,
  MatchLevel,
  Opportunity,
  OpportunityEligibility,
} from './opportunityTypes';

export const IH_THEMES = [
  'hydrogen',
  'power-to-x',
  'ammonia',
  'e-fuel',
  'methanol',
  'energy transition',
  'energy security',
  'renewable',
  'decarbonization',
  'decarbonisation',
  'energy planning',
  'net zero',
  'climate',
  'industrial heat',
  'ccus',
  'circular economy',
];

export const IH_SERVICES = [
  'strategy',
  'roadmap',
  'feasibility',
  'pre-feasibility',
  'market study',
  'market analysis',
  'value chain',
  'regulatory',
  'policy',
  'impact assessment',
  'evaluation',
  'technical assistance',
  'advisory',
  'stakeholder',
  'capacity building',
  'training',
  'demand analysis',
  'project preparation',
  'baseline study',
  'sector assessment',
];

export const TARGET_REGIONS = [
  'europe',
  'spain',
  'portugal',
  'germany',
  'france',
  'italy',
  'netherlands',
  'belgium',
  'latin america',
  'chile',
  'argentina',
  'brazil',
  'colombia',
  'mexico',
  'uruguay',
  'morocco',
  'africa',
  'namibia',
  'egypt',
  'kenya',
  'global',
];

// Budget sweet spot for a small specialized consultancy (EUR).
const BUDGET_IDEAL_MIN = 30_000;
const BUDGET_IDEAL_MAX = 800_000;

function matchCount(haystack: string, needles: string[]): string[] {
  const h = haystack.toLowerCase();
  return needles.filter((n) => h.includes(n));
}

export interface ScoringInput {
  title: string;
  topics: string[];
  services: string[];
  organization: string;
  country: string;
  region?: string;
  summary: string;
  budgetMaxEur?: number;
  deadline?: string;
  eligibility: OpportunityEligibility;
}

export function levelForScore(score: number): MatchLevel {
  if (score >= 80) return 'high';
  if (score >= 60) return 'review';
  if (score >= 40) return 'possible_with_partners';
  return 'low';
}

export const MATCH_LEVEL_LABELS: Record<MatchLevel, string> = {
  high: 'High priority',
  review: 'Review',
  possible_with_partners: 'Possible with partners',
  low: 'Low priority',
};

/**
 * Score an opportunity 0–100 with per-factor explanations.
 * Factors (max points): theme 25, services 20, geography 12, client type 8,
 * budget fit 12, deadline runway 8, eligibility barriers 10, strategic 5.
 */
export function scoreOpportunity(
  input: ScoringInput,
  now: Date = new Date(),
): { score: number; level: MatchLevel; factors: MatchFactor[] } {
  const factors: MatchFactor[] = [];
  const text = `${input.title} ${input.topics.join(' ')} ${input.summary}`.toLowerCase();

  // Theme match (0–25)
  const themes = matchCount(text, IH_THEMES);
  const themePoints = Math.min(
    25,
    themes.length >= 3 ? 25 : themes.length === 2 ? 19 : themes.length === 1 ? 12 : 2,
  );
  factors.push({
    key: 'theme',
    label: 'Theme match',
    points: themePoints,
    max: 25,
    reason:
      themes.length > 0
        ? `Matches Impact Hydrogen themes: ${themes.slice(0, 4).join(', ')}.`
        : 'No direct match with hydrogen/energy/decarbonization themes.',
  });

  // Service match (0–20)
  const serviceText = `${text} ${input.services.join(' ').toLowerCase()}`;
  const services = matchCount(serviceText, IH_SERVICES);
  const servicePoints = Math.min(
    20,
    services.length >= 3 ? 20 : services.length === 2 ? 15 : services.length === 1 ? 9 : 2,
  );
  factors.push({
    key: 'services',
    label: 'Service match',
    points: servicePoints,
    max: 20,
    reason:
      services.length > 0
        ? `Requested services align with our offering: ${services.slice(0, 4).join(', ')}.`
        : 'Requested services fall outside our core consulting offering.',
  });

  // Geography (0–12)
  const geoText = `${input.country} ${input.region ?? ''}`.toLowerCase();
  const geoHit = TARGET_REGIONS.some((r) => geoText.includes(r));
  factors.push({
    key: 'geography',
    label: 'Geography',
    points: geoHit ? 12 : 5,
    max: 12,
    reason: geoHit
      ? `${input.country} is within our target geographies.`
      : `${input.country} is outside our usual focus regions.`,
  });

  // Client type (0–8)
  const org = input.organization.toLowerCase();
  const institutional =
    /(union|commission|bank|nations|unido|undp|unops|giz|agency|ministry|government|partnership|fund|ted|ebrd|eib|idb|afdb|fiiapp|expertise)/.test(
      org,
    );
  factors.push({
    key: 'client',
    label: 'Client type',
    points: institutional ? 8 : 4,
    max: 8,
    reason: institutional
      ? 'Institutional client — matches our target client profile.'
      : 'Private/unknown client — possible but less typical.',
  });

  // Budget fit (0–12)
  let budgetPoints = 6;
  let budgetReason = 'Budget not available — assumed reviewable.';
  if (typeof input.budgetMaxEur === 'number') {
    if (input.budgetMaxEur >= BUDGET_IDEAL_MIN && input.budgetMaxEur <= BUDGET_IDEAL_MAX) {
      budgetPoints = 12;
      budgetReason = 'Budget within our target range for a specialized consultancy.';
    } else if (input.budgetMaxEur < BUDGET_IDEAL_MIN) {
      budgetPoints = 4;
      budgetReason = 'Budget may be too small to be worthwhile.';
    } else {
      budgetPoints = 7;
      budgetReason = 'Large contract — likely requires a consortium to absorb.';
    }
  }
  factors.push({
    key: 'budget',
    label: 'Budget fit',
    points: budgetPoints,
    max: 12,
    reason: budgetReason,
  });

  // Deadline runway (0–8)
  let deadlinePoints = 4;
  let deadlineReason = 'Deadline not available.';
  if (input.deadline) {
    const days = Math.floor((new Date(input.deadline).getTime() - now.getTime()) / 86_400_000);
    if (days < 0) {
      deadlinePoints = 0;
      deadlineReason = 'Deadline has passed.';
    } else if (days < 7) {
      deadlinePoints = 2;
      deadlineReason = `Only ${days} day(s) left — very short runway to prepare.`;
    } else if (days < 15) {
      deadlinePoints = 5;
      deadlineReason = `${days} days left — tight but feasible.`;
    } else {
      deadlinePoints = 8;
      deadlineReason = `${days} days left — comfortable preparation window.`;
    }
  }
  factors.push({
    key: 'deadline',
    label: 'Deadline runway',
    points: deadlinePoints,
    max: 8,
    reason: deadlineReason,
  });

  // Eligibility barriers (0–10, starts at 10 and loses points per barrier)
  let eligibilityPoints = 10;
  const barriers: string[] = [];
  if (input.eligibility.consortiumRequired) {
    eligibilityPoints -= 3;
    barriers.push('consortium required');
  }
  if (input.eligibility.localPartnerRequired) {
    eligibilityPoints -= 3;
    barriers.push('local partner required');
  }
  if ((input.eligibility.minAnnualTurnoverEur ?? 0) > 500_000) {
    eligibilityPoints -= 3;
    barriers.push('high minimum turnover');
  }
  if ((input.eligibility.minReferences ?? 0) > 3) {
    eligibilityPoints -= 2;
    barriers.push('many references required');
  }
  eligibilityPoints = Math.max(0, eligibilityPoints);
  factors.push({
    key: 'eligibility',
    label: 'Eligibility barriers',
    points: eligibilityPoints,
    max: 10,
    reason:
      barriers.length > 0
        ? `Barriers: ${barriers.join('; ')}.`
        : 'No significant eligibility barriers detected.',
  });

  // Strategic value (0–5): hydrogen-specific work is core positioning.
  const strategic = /hydrogen|h2|power-to-x|ammonia/.test(text);
  factors.push({
    key: 'strategic',
    label: 'Strategic value',
    points: strategic ? 5 : 2,
    max: 5,
    reason: strategic
      ? 'Core hydrogen positioning — builds directly on our track record.'
      : 'Adjacent to core positioning.',
  });

  const score = Math.max(
    0,
    Math.min(
      100,
      factors.reduce((sum, f) => sum + f.points, 0),
    ),
  );
  return { score, level: levelForScore(score), factors };
}

export function daysUntil(deadline: string | undefined, now: Date = new Date()): number | null {
  if (!deadline) return null;
  return Math.floor((new Date(deadline).getTime() - now.getTime()) / 86_400_000);
}

export function deadlineTone(
  deadline: string | undefined,
): 'closed' | 'red' | 'orange' | 'green' | 'none' {
  const days = daysUntil(deadline);
  if (days == null) return 'none';
  if (days < 0) return 'closed';
  if (days < 7) return 'red';
  if (days < 15) return 'orange';
  return 'green';
}

/** Duplicate detection: reference match, URL match, or title+organization match. */
export function isDuplicateOpportunity(
  candidate: Pick<Opportunity, 'title' | 'organization' | 'reference' | 'url'>,
  existing: Pick<Opportunity, 'title' | 'organization' | 'reference' | 'url'>[],
): boolean {
  const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase().replace(/\/+$/, '');
  return existing.some((e) => {
    if (candidate.reference && e.reference && norm(candidate.reference) === norm(e.reference))
      return true;
    if (candidate.url && e.url && norm(candidate.url) === norm(e.url)) return true;
    return (
      norm(candidate.title) === norm(e.title) &&
      norm(candidate.organization) === norm(e.organization)
    );
  });
}
