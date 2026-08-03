// Future-integration provider interfaces (design only).
// These stubs exist so the future architecture (docs/FUTURE_ARCHITECTURE.md)
// can be plugged in without a rewrite. They MUST NEVER make network requests
// in the prototype — every method throws.

export interface ResearchInput {
  personName: string;
  companyName: string;
  workspaceContext: string;
}
export interface ResearchSummary {
  professionalSummary: string;
  companySummary: string;
  confidence: 'high' | 'medium' | 'low';
  sources: string[];
}
export interface DraftInput {
  personName: string;
  companyName: string;
  angle: string;
  language: string;
  tone: string;
}

export interface AIProvider {
  synthesizeResearch(input: ResearchInput): Promise<ResearchSummary>;
  classifyProspect(input: ResearchInput): Promise<{ priority: string }>;
  scoreProspect(input: ResearchInput): Promise<{ score: number }>;
  draftMessage(input: DraftInput): Promise<{ message: string }>;
}

export interface SearchProvider {
  search(query: string): Promise<{ title: string; url: string; snippet: string }[]>;
}

export interface EnrichmentProvider {
  findEmail(personName: string, companyDomain: string): Promise<{ email: string | null }>;
  verifyEmail(email: string): Promise<{ deliverable: boolean }>;
}

export interface EmailProvider {
  createDraft(to: string, subject: string, body: string): Promise<{ draftId: string }>;
}

export interface CalendarProvider {
  proposeSlots(durationMinutes: number): Promise<{ start: string; end: string }[]>;
}

const NOT_IMPLEMENTED =
  'Not implemented in the prototype. No external APIs are connected — see docs/FUTURE_ARCHITECTURE.md.';

export const noopAIProvider: AIProvider = {
  synthesizeResearch: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
  classifyProspect: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
  scoreProspect: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
  draftMessage: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
};

export const noopSearchProvider: SearchProvider = {
  search: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
};

export const noopEnrichmentProvider: EnrichmentProvider = {
  findEmail: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
  verifyEmail: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
};

export const noopEmailProvider: EmailProvider = {
  createDraft: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
};

export const noopCalendarProvider: CalendarProvider = {
  proposeSlots: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
};
