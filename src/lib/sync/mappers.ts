// Entity ⇄ Postgres row mappers. Conversion is SHALLOW on purpose: top-level
// keys switch between camelCase and snake_case, while jsonb payloads
// (targetingRules, scoreBreakdown, eligibility, matchFactors, history,
// documents, deliveryEstimate, criteria) pass through verbatim.

import type { Activity, AppState, Company, FollowUp, Person, Prospect, Workspace } from '../types';
import type { Opportunity, OpportunityAlert, OpportunitySource } from '../opportunityTypes';

export type Row = Record<string, unknown>;

export function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

/** Shallow key conversion; undefined → null so Postgres columns are set explicitly. */
export function snakeifyShallow(entity: Record<string, unknown>): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(entity)) {
    row[camelToSnake(k)] = v === undefined ? null : v;
  }
  return row;
}

/** Shallow key conversion; null → undefined to match optional entity fields. */
export function camelizeShallow(row: Row): Record<string, unknown> {
  const entity: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    entity[snakeToCamel(k)] = v === null ? undefined : v;
  }
  return entity;
}

function pick<T extends object>(obj: Record<string, unknown>, template: T): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(template)) {
    out[key] = obj[key];
  }
  return out as T;
}

// Templates: one fully-populated shape per entity so fromRow() drops any DB
// bookkeeping columns (owner_id, created_at where the client type lacks them).

const WORKSPACE_TEMPLATE: Workspace = {
  id: '',
  name: '',
  senderName: '',
  senderTitle: '',
  senderCompany: '',
  senderBio: '',
  services: [],
  valueProposition: '',
  defaultLanguage: 'en',
  defaultTone: 'professional',
  preferredMessageLength: 'medium',
  dailyTarget: 10,
  targetingRules: {
    targetCountries: [],
    targetIndustries: [],
    targetRoles: [],
    targetCompanyTypes: [],
    keywords: [],
    negativeKeywords: [],
    excludedCompanies: [],
  },
};

const COMPANY_TEMPLATE: Company = {
  id: '',
  name: '',
  website: '',
  industry: '',
  city: '',
  country: '',
  size: '',
  type: '',
  description: '',
  relevantInitiatives: [],
  commercialTrigger: '',
  score: 0,
  notes: '',
  isDemo: false,
};

const PERSON_TEMPLATE: Person = {
  id: '',
  fullName: '',
  firstName: '',
  lastName: '',
  title: '',
  companyId: '',
  city: '',
  country: '',
  linkedinUrl: '',
  seniority: '',
  functionalArea: '',
  professionalSummary: '',
  careerSummary: '',
  researchConfidence: 'medium',
  sourceReferences: [],
  isDemo: false,
};

const PROSPECT_TEMPLATE: Prospect = {
  id: '',
  workspaceId: '',
  personId: '',
  companyId: '',
  status: 'new',
  priority: 'networking',
  score: 0,
  scoreBreakdown: { relevance: 0, seniority: 0, timing: 0, geography: 0 },
  fitReason: '',
  timingReason: '',
  outreachAngle: '',
  recommendedService: '',
  patternId: '',
  originalDraft: '',
  editedMessage: null,
  editedAt: null,
  finalMessage: null,
  notes: '',
  createdAt: '',
  reviewedAt: null,
  sentAt: null,
  lastActivityAt: '',
  outcome: null,
  isDemo: false,
};

const ACTIVITY_TEMPLATE: Activity = {
  id: '',
  prospectId: '',
  type: 'created',
  previousStatus: null,
  newStatus: null,
  notes: '',
  createdAt: '',
};

const FOLLOW_UP_TEMPLATE: FollowUp = {
  id: '',
  prospectId: '',
  dueAt: '',
  status: 'pending',
  message: '',
  completedAt: null,
};

const OPPORTUNITY_TEMPLATE: Opportunity = {
  id: '',
  title: '',
  organization: '',
  funder: undefined,
  program: undefined,
  reference: undefined,
  url: undefined,
  sourceName: '',
  type: 'other',
  contractType: undefined,
  topics: [],
  services: [],
  country: '',
  region: undefined,
  language: undefined,
  publishedAt: undefined,
  questionsDeadline: undefined,
  deadline: undefined,
  startDate: undefined,
  durationMonths: undefined,
  foundAt: '',
  lastCheckedAt: '',
  budgetMinEur: undefined,
  budgetMaxEur: undefined,
  currency: undefined,
  eligibility: { consortiumRequired: false, localPartnerRequired: false },
  procedure: undefined,
  evaluationCriteria: undefined,
  expertProfiles: [],
  deliverables: [],
  documents: [],
  summary: '',
  scopeOfWork: undefined,
  relevanceRationale: '',
  suggestedServices: [],
  risks: [],
  nextSteps: [],
  score: 0,
  matchLevel: 'low',
  matchFactors: [],
  status: 'new',
  saved: false,
  assignee: undefined,
  notes: '',
  history: [],
  deliveryEstimate: undefined,
  isDemo: false,
};

const SOURCE_TEMPLATE: OpportunitySource = {
  id: '',
  name: '',
  organizationType: '',
  url: '',
  active: true,
  isDemo: false,
};

const ALERT_TEMPLATE: OpportunityAlert = {
  id: '',
  name: '',
  criteria: {},
  createdAt: '',
};

// --- toRow: entity (+ derived workspace_id where the client type lacks it) ---

export function workspaceToRow(w: Workspace, ownerId?: string): Row {
  const row = snakeifyShallow(w as unknown as Record<string, unknown>);
  if (ownerId) row.owner_id = ownerId;
  return row;
}

export function companyToRow(c: Company, workspaceId: string): Row {
  return { ...snakeifyShallow(c as unknown as Record<string, unknown>), workspace_id: workspaceId };
}

export function personToRow(p: Person, workspaceId: string): Row {
  const row = snakeifyShallow(p as unknown as Record<string, unknown>);
  row.workspace_id = workspaceId;
  if (row.company_id === '') row.company_id = null;
  return row;
}

export function prospectToRow(p: Prospect): Row {
  const row = snakeifyShallow(p as unknown as Record<string, unknown>);
  if (row.company_id === '') row.company_id = null;
  return row;
}

export function activityToRow(a: Activity, workspaceId: string): Row {
  return { ...snakeifyShallow(a as unknown as Record<string, unknown>), workspace_id: workspaceId };
}

export function followUpToRow(f: FollowUp, workspaceId: string): Row {
  return { ...snakeifyShallow(f as unknown as Record<string, unknown>), workspace_id: workspaceId };
}

export function opportunityToRow(o: Opportunity, workspaceId: string): Row {
  return { ...snakeifyShallow(o as unknown as Record<string, unknown>), workspace_id: workspaceId };
}

export function sourceToRow(s: OpportunitySource, workspaceId: string): Row {
  return { ...snakeifyShallow(s as unknown as Record<string, unknown>), workspace_id: workspaceId };
}

export function alertToRow(a: OpportunityAlert, workspaceId: string): Row {
  return { ...snakeifyShallow(a as unknown as Record<string, unknown>), workspace_id: workspaceId };
}

// --- fromRow: row → entity (drops bookkeeping columns via templates) ---

export function workspaceFromRow(row: Row): Workspace {
  return pick(camelizeShallow(row), WORKSPACE_TEMPLATE);
}
export function companyFromRow(row: Row): Company {
  return pick(camelizeShallow(row), COMPANY_TEMPLATE);
}
export function personFromRow(row: Row): Person {
  const p = pick(camelizeShallow(row), PERSON_TEMPLATE);
  return { ...p, companyId: p.companyId ?? '' };
}
export function prospectFromRow(row: Row): Prospect {
  const p = pick(camelizeShallow(row), PROSPECT_TEMPLATE) as Prospect & Record<string, unknown>;
  // Restore explicit nulls for the fields typed `string | null`.
  for (const k of [
    'editedMessage',
    'editedAt',
    'finalMessage',
    'reviewedAt',
    'sentAt',
    'outcome',
  ]) {
    if (p[k] === undefined) p[k] = null;
  }
  return { ...p, companyId: (p.companyId as string | undefined) ?? '' };
}
export function activityFromRow(row: Row): Activity {
  const a = pick(camelizeShallow(row), ACTIVITY_TEMPLATE) as Activity & Record<string, unknown>;
  if (a.previousStatus === undefined) a.previousStatus = null;
  if (a.newStatus === undefined) a.newStatus = null;
  return a;
}
export function followUpFromRow(row: Row): FollowUp {
  const f = pick(camelizeShallow(row), FOLLOW_UP_TEMPLATE);
  return { ...f, completedAt: f.completedAt ?? null };
}
export function opportunityFromRow(row: Row): Opportunity {
  return pick(camelizeShallow(row), OPPORTUNITY_TEMPLATE);
}
export function sourceFromRow(row: Row): OpportunitySource {
  return pick(camelizeShallow(row), SOURCE_TEMPLATE);
}
export function alertFromRow(row: Row): OpportunityAlert {
  return pick(camelizeShallow(row), ALERT_TEMPLATE);
}

/** workspace_id owning each row, captured before templates drop it. */
export function rowWorkspaceId(row: Row): string {
  return String(row.workspace_id ?? '');
}

export function emptyCloudState(): AppState {
  return {
    version: 2,
    activeWorkspaceId: '',
    workspaces: [],
    companies: [],
    people: [],
    prospects: [],
    activities: [],
    followUps: [],
    opportunities: [],
    opportunitySources: [],
    opportunityAlerts: [],
  };
}
