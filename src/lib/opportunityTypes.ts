// Data model for the Tenders & Opportunities module.
// Optional fields render as "Not available" in the UI — never invented.

export type OpportunityStatus =
  | 'new'
  | 'review'
  | 'go'
  | 'partner_search'
  | 'preparing_bid'
  | 'submitted'
  | 'won'
  | 'lost'
  | 'discarded';

export const OPPORTUNITY_STATUSES: OpportunityStatus[] = [
  'new',
  'review',
  'go',
  'partner_search',
  'preparing_bid',
  'submitted',
  'won',
  'lost',
  'discarded',
];

export type OpportunityType =
  | 'tender'
  | 'rfp'
  | 'eoi'
  | 'call_for_experts'
  | 'technical_assistance'
  | 'framework'
  | 'grant'
  | 'partner_search'
  | 'other';

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  tender: 'Tender / Licitación',
  rfp: 'RFP / RFQ',
  eoi: 'Expression of Interest',
  call_for_experts: 'Call for experts',
  technical_assistance: 'Technical assistance',
  framework: 'Framework contract',
  grant: 'Grant / Call for proposals',
  partner_search: 'Partner / consortium search',
  other: 'Other',
};

export interface OpportunityEligibility {
  consortiumRequired: boolean;
  localPartnerRequired: boolean;
  eligibleCountries?: string;
  minAnnualTurnoverEur?: number;
  minReferences?: number;
  minYearsExperience?: number;
  requiredLanguages?: string[];
  notes?: string;
}

export interface MatchFactor {
  key: string;
  label: string;
  points: number;
  max: number;
  reason: string;
}

export type MatchLevel = 'high' | 'review' | 'possible_with_partners' | 'low';

export interface DeliveryEstimateInput {
  expertCount: number;
  totalExpertDays: number;
  avgDailyRateEur: number;
  trips: number;
  costPerTripEur: number;
  workshops: number;
  costPerWorkshopEur: number;
  localCostsEur: number;
  subcontractingEur: number;
  contingencyPercent: number;
}

export interface DeliveryEstimateResult {
  expertCostEur: number;
  travelCostEur: number;
  workshopCostEur: number;
  localCostsEur: number;
  subcontractingEur: number;
  contingencyEur: number;
  totalCostEur: number;
  budgetEur: number | null;
  marginEur: number | null;
  marginPercent: number | null;
}

export interface DeliveryEstimate {
  input: DeliveryEstimateInput;
  result: DeliveryEstimateResult;
  updatedAt: string;
}

export interface OpportunityHistoryEntry {
  at: string;
  event: string;
}

export interface Opportunity {
  id: string;
  // Identification
  title: string;
  organization: string;
  funder?: string;
  program?: string;
  reference?: string;
  url?: string;
  sourceName: string;
  // Classification
  type: OpportunityType;
  contractType?: string;
  topics: string[];
  services: string[];
  country: string;
  region?: string;
  language?: string;
  // Dates (ISO)
  publishedAt?: string;
  questionsDeadline?: string;
  deadline?: string;
  startDate?: string;
  durationMonths?: number;
  foundAt: string;
  lastCheckedAt: string;
  // Budget
  budgetMinEur?: number;
  budgetMaxEur?: number;
  currency?: string;
  // Eligibility & procedure
  eligibility: OpportunityEligibility;
  procedure?: string;
  evaluationCriteria?: string;
  expertProfiles: string[];
  deliverables: string[];
  documents: { label: string; url: string }[];
  // Analysis (prototype: simulated, labeled as such)
  summary: string;
  scopeOfWork?: string;
  relevanceRationale: string;
  suggestedServices: string[];
  risks: string[];
  nextSteps: string[];
  score: number;
  matchLevel: MatchLevel;
  matchFactors: MatchFactor[];
  // Workflow
  status: OpportunityStatus;
  saved: boolean;
  assignee?: string;
  notes: string;
  history: OpportunityHistoryEntry[];
  deliveryEstimate?: DeliveryEstimate;
  isDemo: boolean;
}

export interface OpportunitySource {
  id: string;
  name: string;
  organizationType: string;
  url: string;
  active: boolean;
  isDemo: boolean;
}

export interface OpportunityAlertCriteria {
  keyword?: string;
  country?: string;
  topic?: string;
  minScore?: number;
}

export interface OpportunityAlert {
  id: string;
  name: string;
  criteria: OpportunityAlertCriteria;
  createdAt: string;
}
