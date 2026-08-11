// Delivery-cost estimator: what it would cost Impact Hydrogen to EXECUTE an
// opportunity (experts, travel, workshops, subcontracting, contingency) vs.
// the opportunity budget → estimated margin. Pure local math.

import type { DeliveryEstimateInput, DeliveryEstimateResult } from './opportunityTypes';

export const DEFAULT_DELIVERY_INPUT: DeliveryEstimateInput = {
  expertCount: 2,
  totalExpertDays: 60,
  avgDailyRateEur: 550,
  trips: 2,
  costPerTripEur: 1500,
  workshops: 1,
  costPerWorkshopEur: 2000,
  localCostsEur: 0,
  subcontractingEur: 0,
  contingencyPercent: 10,
};

export function estimateDelivery(
  input: DeliveryEstimateInput,
  budgetEur: number | null,
): DeliveryEstimateResult {
  const clamp = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const expertCostEur = clamp(input.totalExpertDays) * clamp(input.avgDailyRateEur);
  const travelCostEur = clamp(input.trips) * clamp(input.costPerTripEur);
  const workshopCostEur = clamp(input.workshops) * clamp(input.costPerWorkshopEur);
  const localCostsEur = clamp(input.localCostsEur);
  const subcontractingEur = clamp(input.subcontractingEur);
  const base = expertCostEur + travelCostEur + workshopCostEur + localCostsEur + subcontractingEur;
  const contingencyEur = base * (clamp(input.contingencyPercent) / 100);
  const totalCostEur = base + contingencyEur;
  const marginEur = budgetEur != null ? budgetEur - totalCostEur : null;
  const marginPercent =
    budgetEur != null && budgetEur > 0 ? ((budgetEur - totalCostEur) / budgetEur) * 100 : null;
  return {
    expertCostEur,
    travelCostEur,
    workshopCostEur,
    localCostsEur,
    subcontractingEur,
    contingencyEur,
    totalCostEur,
    budgetEur,
    marginEur,
    marginPercent,
  };
}
