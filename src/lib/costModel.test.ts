import { describe, expect, it } from 'vitest';
import { BUDGET_LIMIT_EUR, DEFAULT_ASSUMPTIONS, estimateCosts } from './costModel';

describe('estimateCosts', () => {
  it('default scenario (20 runs × 100 candidates) stays under €100', () => {
    const r = estimateCosts(DEFAULT_ASSUMPTIONS);
    expect(r.candidatesPerMonth).toBe(2000);
    expect(r.totalEur).toBeLessThan(BUDGET_LIMIT_EUR);
    expect(r.overBudget).toBe(false);
    expect(r.budgetRemainingEur).toBeGreaterThan(0);
  });

  it('expensive configuration triggers the over-budget warning', () => {
    const r = estimateCosts({
      ...DEFAULT_ASSUMPTIONS,
      searchesPerCandidate: 8,
      inputTokensPerCandidate: 30000,
      outputTokensPerCandidate: 5000,
      lowCostModelPercent: 0,
      capableModelPercent: 100,
      useBatchApi: false,
      databasePlanId: 'pro',
      enrichmentProviderId: 'hunter-starter',
    });
    expect(r.overBudget).toBe(true);
    expect(r.totalEur).toBeGreaterThan(BUDGET_LIMIT_EUR);
    expect(r.suggestions.length).toBeGreaterThan(0);
  });

  it('batch API halves the AI cost', () => {
    const withBatch = estimateCosts({ ...DEFAULT_ASSUMPTIONS, useBatchApi: true });
    const without = estimateCosts({ ...DEFAULT_ASSUMPTIONS, useBatchApi: false });
    expect(withBatch.aiEur).toBeCloseTo(without.aiEur / 2, 6);
  });

  it('scales linearly with candidate volume', () => {
    const small = estimateCosts({ ...DEFAULT_ASSUMPTIONS, candidatesPerRun: 20 });
    const large = estimateCosts({ ...DEFAULT_ASSUMPTIONS, candidatesPerRun: 100 });
    expect(large.aiEur).toBeCloseTo(small.aiEur * 5, 6);
    expect(large.searchEur).toBeCloseTo(small.searchEur * 5, 6);
  });

  it('identifies the main cost driver', () => {
    const r = estimateCosts({ ...DEFAULT_ASSUMPTIONS, searchesPerCandidate: 10 });
    expect(r.mainDriver).toBe('Web search');
  });

  it('applies the safety margin', () => {
    const noMargin = estimateCosts({ ...DEFAULT_ASSUMPTIONS, safetyMarginPercent: 0 });
    const withMargin = estimateCosts({ ...DEFAULT_ASSUMPTIONS, safetyMarginPercent: 20 });
    expect(withMargin.totalEur).toBeCloseTo(noMargin.totalEur * 1.2, 6);
  });

  it('handles zero volume without dividing by zero', () => {
    const r = estimateCosts({ ...DEFAULT_ASSUMPTIONS, runsPerMonth: 0 });
    expect(r.costPerCandidateEur).toBe(0);
    expect(r.totalEur).toBeGreaterThanOrEqual(0);
  });
});
