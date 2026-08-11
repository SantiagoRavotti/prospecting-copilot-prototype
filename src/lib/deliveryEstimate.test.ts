import { describe, expect, it } from 'vitest';
import { DEFAULT_DELIVERY_INPUT, estimateDelivery } from './deliveryEstimate';

describe('estimateDelivery', () => {
  it('computes component costs and total', () => {
    const r = estimateDelivery(
      {
        expertCount: 2,
        totalExpertDays: 100,
        avgDailyRateEur: 500,
        trips: 2,
        costPerTripEur: 1500,
        workshops: 2,
        costPerWorkshopEur: 2000,
        localCostsEur: 3000,
        subcontractingEur: 10000,
        contingencyPercent: 10,
      },
      200_000,
    );
    expect(r.expertCostEur).toBe(50_000);
    expect(r.travelCostEur).toBe(3_000);
    expect(r.workshopCostEur).toBe(4_000);
    const base = 50_000 + 3_000 + 4_000 + 3_000 + 10_000;
    expect(r.contingencyEur).toBeCloseTo(base * 0.1, 6);
    expect(r.totalCostEur).toBeCloseTo(base * 1.1, 6);
    expect(r.marginEur).toBeCloseTo(200_000 - base * 1.1, 6);
    expect(r.marginPercent).toBeCloseTo(((200_000 - base * 1.1) / 200_000) * 100, 6);
  });

  it('handles missing budget without margin', () => {
    const r = estimateDelivery(DEFAULT_DELIVERY_INPUT, null);
    expect(r.marginEur).toBeNull();
    expect(r.marginPercent).toBeNull();
    expect(r.totalCostEur).toBeGreaterThan(0);
  });

  it('flags negative margin when cost exceeds budget', () => {
    const r = estimateDelivery({ ...DEFAULT_DELIVERY_INPUT, totalExpertDays: 500 }, 50_000);
    expect(r.marginEur).not.toBeNull();
    expect(r.marginEur!).toBeLessThan(0);
  });

  it('treats invalid/negative inputs as zero', () => {
    const r = estimateDelivery(
      { ...DEFAULT_DELIVERY_INPUT, trips: -3, localCostsEur: Number.NaN },
      100_000,
    );
    expect(r.travelCostEur).toBe(0);
    expect(r.localCostsEur).toBe(0);
  });
});
