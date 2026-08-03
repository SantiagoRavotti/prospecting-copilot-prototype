// Core data model for the Prospecting Copilot prototype.
// All data lives in browser local storage — no backend, no external APIs.

export type Language = 'en' | 'es';
export type Tone = 'professional' | 'warm' | 'direct' | 'curious';
export type MessageLength = 'short' | 'medium' | 'long';

export type Priority = 'hot' | 'strong_fit' | 'networking' | 'low_confidence';

export type ResearchConfidence = 'high' | 'medium' | 'low';

export type ProspectStatus =
  | 'new'
  | 'ready_for_review'
  | 'saved_for_later'
  | 'connection_sent'
  | 'connection_accepted'
  | 'replied'
  | 'follow_up_required'
  | 'meeting_proposed'
  | 'meeting_booked'
  | 'opportunity'
  | 'not_interested'
  | 'do_not_contact'
  | 'archived';

export const ALL_STATUSES: ProspectStatus[] = [
  'new',
  'ready_for_review',
  'saved_for_later',
  'connection_sent',
  'connection_accepted',
  'replied',
  'follow_up_required',
  'meeting_proposed',
  'meeting_booked',
  'opportunity',
  'not_interested',
  'do_not_contact',
  'archived',
];

export interface TargetingRules {
  targetCountries: string[];
  targetIndustries: string[];
  targetRoles: string[];
  targetCompanyTypes: string[];
  keywords: string[];
  negativeKeywords: string[];
  excludedCompanies: string[];
}

export interface Workspace {
  id: string;
  name: string;
  senderName: string;
  senderTitle: string;
  senderCompany: string;
  senderBio: string;
  services: string[];
  valueProposition: string;
  defaultLanguage: Language;
  defaultTone: Tone;
  preferredMessageLength: MessageLength;
  dailyTarget: number;
  targetingRules: TargetingRules;
}

export interface Company {
  id: string;
  name: string;
  website: string;
  industry: string;
  city: string;
  country: string;
  size: string;
  type: string;
  description: string;
  relevantInitiatives: string[];
  commercialTrigger: string;
  score: number;
  notes: string;
  isDemo: boolean;
}

export interface Person {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  title: string;
  companyId: string;
  city: string;
  country: string;
  linkedinUrl: string;
  seniority: string;
  functionalArea: string;
  professionalSummary: string;
  careerSummary: string;
  researchConfidence: ResearchConfidence;
  sourceReferences: string[];
  isDemo: boolean;
}

export interface ScoreBreakdown {
  relevance: number; // 0–40
  seniority: number; // 0–25
  timing: number; // 0–20
  geography: number; // 0–15
}

export interface Prospect {
  id: string;
  workspaceId: string;
  personId: string;
  companyId: string;
  status: ProspectStatus;
  priority: Priority;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  fitReason: string;
  timingReason: string;
  outreachAngle: string;
  recommendedService: string;
  patternId: string;
  originalDraft: string;
  editedMessage: string | null;
  finalMessage: string | null;
  notes: string;
  createdAt: string;
  reviewedAt: string | null;
  editedAt: string | null;
  sentAt: string | null;
  lastActivityAt: string;
  outcome: string | null;
  isDemo: boolean;
}

export type ActivityType =
  | 'created'
  | 'status_change'
  | 'message_edited'
  | 'message_reset'
  | 'marked_sent'
  | 'skipped'
  | 'note_added'
  | 'follow_up_created'
  | 'follow_up_completed'
  | 'imported';

export interface Activity {
  id: string;
  prospectId: string;
  type: ActivityType;
  previousStatus: ProspectStatus | null;
  newStatus: ProspectStatus | null;
  notes: string;
  createdAt: string;
}

export type FollowUpStatus = 'pending' | 'completed' | 'cancelled';

export interface FollowUp {
  id: string;
  prospectId: string;
  dueAt: string;
  status: FollowUpStatus;
  message: string;
  completedAt: string | null;
}

export interface AppState {
  version: number;
  activeWorkspaceId: string;
  workspaces: Workspace[];
  companies: Company[];
  people: Person[];
  prospects: Prospect[];
  activities: Activity[];
  followUps: FollowUp[];
}
