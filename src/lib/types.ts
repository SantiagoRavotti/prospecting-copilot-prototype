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
  /** The LinkedIn account that sends for this workspace (queue/caps shared). */
  senderAccountId?: string;
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
  /** Campaign this prospect belongs to (campaign-driven flow). */
  campaignId?: string;
  approval?: ProspectApproval;
  research?: ProspectResearch;
  /** New message versions from ChatGPT. They never replace the current text by themselves. */
  messageProposals?: MessageProposal[];
  /** Previous message texts that were replaced (edits, applied proposals, resets). */
  messageHistory?: MessageHistoryEntry[];
}

export interface MessageProposal {
  id: string;
  text: string;
  createdAt: string;
  source: 'chatgpt_import' | 'chatgpt_mcp';
  importId?: string;
  status: 'pending' | 'applied' | 'dismissed';
}

export interface MessageHistoryEntry {
  /** The text that was replaced. */
  text: string;
  /** When it was replaced. */
  at: string;
  reason: 'edit' | 'proposal_applied' | 'reset' | 'restore';
  wasApproved: boolean;
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

import type { Opportunity, OpportunityAlert, OpportunitySource } from './opportunityTypes';

// ---------------------------------------------------------------------------
// Campaigns, research tasks, approval and execution batches
// ---------------------------------------------------------------------------

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'done';

export interface Campaign {
  id: string;
  workspaceId: string;
  name: string;
  objective: string;
  audience: string;
  searchCriteria: string;
  language: Language;
  tone: Tone;
  targetCount: number;
  exclusions: string[];
  messageGuidelines: string;
  /** Saved examples of the user's style, included in every research package. */
  styleExamples?: string[];
  schedule: { prepDate?: string; executeDate?: string; dailyCap: number };
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
}

export type ResearchTaskStatus =
  | 'pending' // created in the app, waiting for a collector
  | 'collecting' // Claude + authenticated browser gathering accessible facts
  | 'ready_for_analysis' // collected data saved; ChatGPT can analyse & draft
  | 'proposals_received' // ChatGPT wrote candidate fichas via MCP
  | 'done';

export interface CollectedPost {
  url: string;
  date?: string;
  title?: string;
  excerpt?: string;
  source: 'linkedin' | 'web';
}

export interface CollectedProfile {
  profileUrl: string;
  fullName?: string;
  headline?: string;
  company?: string;
  photoUrl?: string;
  posts: CollectedPost[];
  /** true only if the collector actually opened the activity page */
  activityChecked: boolean;
  accessNotes: string[];
  collectedAt: string;
  collector: 'claude' | 'mock';
}

export interface ResearchTask {
  id: string;
  campaignId: string;
  directive: string;
  status: ResearchTaskStatus;
  seedProfileUrls: string[];
  collected: CollectedProfile[];
  createdAt: string;
  updatedAt: string;
  log: { at: string; event: string }[];
}

export type ApprovalStatus = 'pending' | 'approved' | 'discarded';

export interface ProspectApproval {
  status: ApprovalStatus;
  /** Exact approved text; any later edit invalidates the approval. */
  approvedText: string | null;
  approvedAt: string | null;
}

export interface ProspectResearch {
  /** Where this research came from. ChatGPT-provided sources are NOT verified by the app. */
  origin?: 'chatgpt_import' | 'mcp';
  importId?: string;
  /** Stable identity of the candidate inside one research task (re-import detection). */
  importKey?: string;
  location?: string;
  /** Facts with the source ChatGPT gave for each (kept alongside verifiedFacts). */
  facts?: { text: string; sourceUrl?: string }[];
  photoSource?: string;
  /** Did ChatGPT say it could read LinkedIn posts? null = not stated. */
  postsAccessible?: boolean | null;
  limitations?: string[];
  verifiedFacts: string[];
  inferences: string[];
  posts: CollectedPost[];
  activityChecked: boolean;
  suggestedOpener: string;
  photoUrl?: string;
  sources: string[];
}

export type RecipientResultStatus =
  | 'sent'
  | 'already_connected'
  | 'pending_invitation'
  | 'skipped'
  | 'error'
  | 'uncertain';

export interface BatchRecipient {
  prospectId: string;
  personName: string;
  profileUrl: string;
  /** Frozen copy of the approved message — the executor never rewrites it. */
  frozenMessage: string;
  result?: {
    status: RecipientResultStatus;
    detail: string;
    at: string;
    verifiedBeforeAction: boolean;
    /** false for uncertain/error: may still be resolved by a later verification */
    resolved: boolean;
  };
}

export type BatchStatus = 'frozen' | 'running' | 'paused' | 'completed' | 'failed';

export interface Batch {
  id: string;
  campaignId: string;
  workspaceId: string;
  /** Queue and daily caps are shared by every campaign of this sender account. */
  senderAccountId: string;
  mode: 'dry_run' | 'live';
  status: BatchStatus;
  recipients: BatchRecipient[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  summary?: { completed: number; skipped: number; pending: number; errors: number };
}

/**
 * Per-action event history. Each event has a unique id (idempotency key):
 * the same event is never processed twice. `verification` events can resolve
 * an earlier uncertain/error result; a confirmed `sent` is final forever.
 */
export interface BatchEvent {
  id: string;
  batchId: string;
  prospectId: string;
  senderAccountId: string;
  mode: 'dry_run' | 'live';
  kind: 'verify' | 'action' | 'result' | 'verification';
  status: RecipientResultStatus;
  detail: string;
  at: string;
  source: 'mock' | 'claude' | 'user';
  verifiedBeforeAction?: boolean;
}

export interface ChannelLimitConfig {
  channel: 'linkedin_invite';
  /** Provisional target until the real form is observed. */
  configuredLimit: number;
  margin: number;
  /** maxlength actually observed on the LinkedIn note field (by the executor). */
  observedLimit: number | null;
  observedAt: string | null;
}

export interface ConversationEntry {
  id: string;
  prospectId: string;
  direction: 'sent' | 'received';
  channel: 'linkedin';
  text: string;
  at: string;
}

export interface BridgeLogEntry {
  at: string;
  url: string;
  title: string;
  snippet: string;
  ok: boolean;
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
  opportunities: Opportunity[];
  opportunitySources: OpportunitySource[];
  opportunityAlerts: OpportunityAlert[];
  /** Desktop only: results of app↔agent↔Chrome bridge checks (CRM evidence). */
  bridgeLog?: BridgeLogEntry[];
  /** Per-prospect message threads (sent auto-logged; replies pasted by the user). */
  conversations?: ConversationEntry[];
  campaigns?: Campaign[];
  researchTasks?: ResearchTask[];
  batches?: Batch[];
  batchEvents?: BatchEvent[];
  /** Single execution queue per sender account: at most one running batch each. */
  executionLocks?: Record<string, { batchId: string; startedAt: string }>;
  channelLimits?: { linkedin_invite: ChannelLimitConfig };
  /** One record per confirmed import of a ChatGPT research result. */
  importHistory?: ImportRecord[];
  /** Saved ChatGPT conversation per scope ("campaign:<id>" or "workspace:<id>"). */
  chatgptConversations?: Record<string, ChatGptConversationLink>;
  /** Campaign currently selected in Campañas (scopes the ChatGPT conversation). */
  activeCampaignId?: string | null;
}

export interface ChatGptConversationLink {
  /** https://chatgpt.com/c/<id> (or a project/GPT conversation URL). */
  url: string;
  conversationId: string;
  boundAt: string;
  /** How it got linked: the app's first delivered directive, or the user's explicit choice. */
  source: 'first_directive' | 'user_choice';
}

export interface ImportRecord {
  id: string;
  at: string;
  taskId: string;
  campaignId: string;
  /** Content fingerprint of the imported result (same result → same fingerprint). */
  fingerprint: string;
  input: 'file' | 'paste';
  fileName?: string;
  created: number;
  updated: number;
  unchanged: number;
  skippedDuplicates: number;
  invalid: number;
  warnings: number;
  prospectIds: string[];
}
