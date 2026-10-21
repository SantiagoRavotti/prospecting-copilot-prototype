// Campaign-driven workflow: campaigns, research tasks, message approval with
// invalidation-on-edit, frozen execution batches, per-action event history,
// single execution queue per sender account, and global dedupe.
// Pure state transitions over AppState (store actions wrap them).

import type {
  AppState,
  Batch,
  BatchEvent,
  BatchRecipient,
  Campaign,
  ChannelLimitConfig,
  CollectedProfile,
  MessageHistoryEntry,
  Person,
  Prospect,
  RecipientResultStatus,
  ResearchTask,
} from './types';
import { normalizeLinkedinUrl, normalizeName } from './dedupe';
import { charCount, nowIso, uid } from './utils';

// ---------------------------------------------------------------------------
// Channel limits: configurable, provisional until observed on the real form.
// ---------------------------------------------------------------------------

export const DEFAULT_CHANNEL_LIMIT: ChannelLimitConfig = {
  channel: 'linkedin_invite',
  configuredLimit: 300, // provisional target until observed
  margin: 20,
  observedLimit: null,
  observedAt: null,
};

export function effectiveLimit(cfg: ChannelLimitConfig): number {
  const base = cfg.observedLimit ?? cfg.configuredLimit;
  return Math.max(1, base - cfg.margin);
}

export function channelLimitFor(state: AppState): ChannelLimitConfig {
  return state.channelLimits?.linkedin_invite ?? DEFAULT_CHANNEL_LIMIT;
}

// ---------------------------------------------------------------------------
// Campaigns & research tasks
// ---------------------------------------------------------------------------

export function newCampaign(
  workspaceId: string,
  input: Partial<Campaign> & { name: string },
): Campaign {
  const now = nowIso();
  return {
    id: uid(),
    workspaceId,
    name: input.name,
    objective: input.objective ?? '',
    audience: input.audience ?? '',
    searchCriteria: input.searchCriteria ?? '',
    language: input.language ?? 'es',
    tone: input.tone ?? 'professional',
    targetCount: input.targetCount ?? 20,
    exclusions: input.exclusions ?? [],
    messageGuidelines: input.messageGuidelines ?? '',
    styleExamples: input.styleExamples ?? [],
    schedule: input.schedule ?? { dailyCap: 20 },
    status: input.status ?? 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function newResearchTask(
  campaignId: string,
  directive: string,
  seeds: string[],
): ResearchTask {
  const now = nowIso();
  return {
    id: uid(),
    campaignId,
    directive,
    status: 'pending',
    seedProfileUrls: seeds,
    collected: [],
    createdAt: now,
    updatedAt: now,
    log: [{ at: now, event: 'Task created in the app.' }],
  };
}

// ---------------------------------------------------------------------------
// Global dedupe (shared across every campaign of the same sender account).
// Hard match = normalized LinkedIn URL (stable id). Name+company = warning only.
// ---------------------------------------------------------------------------

export interface DedupeVerdict {
  hardDuplicate: boolean;
  possibleDuplicate: boolean;
  matchedPersonId?: string;
}

export function dedupeVerdict(
  state: AppState,
  candidate: { fullName: string; companyName: string; linkedinUrl?: string | null },
): DedupeVerdict {
  const url = normalizeLinkedinUrl(candidate.linkedinUrl);
  if (url) {
    const hit = state.people.find((p) => normalizeLinkedinUrl(p.linkedinUrl) === url);
    if (hit) return { hardDuplicate: true, possibleDuplicate: false, matchedPersonId: hit.id };
  }
  const nameKey = normalizeName(candidate.fullName);
  const companyKey = normalizeName(candidate.companyName);
  const soft = state.people.find((p) => {
    const company = state.companies.find((c) => c.id === p.companyId)?.name ?? '';
    return normalizeName(p.fullName) === nameKey && normalizeName(company) === companyKey;
  });
  if (soft) return { hardDuplicate: false, possibleDuplicate: true, matchedPersonId: soft.id };
  return { hardDuplicate: false, possibleDuplicate: false };
}

// ---------------------------------------------------------------------------
// Message versions & approval
// ---------------------------------------------------------------------------

export function finalText(p: Prospect): string {
  return p.editedMessage ?? p.originalDraft;
}

export interface ApprovalCheck {
  ok: boolean;
  chars: number;
  limit: number;
  reason?: string;
}

export function checkApprovable(text: string, cfg: ChannelLimitConfig): ApprovalCheck {
  const chars = charCount(text);
  const limit = effectiveLimit(cfg);
  if (text.trim() === '') return { ok: false, chars, limit, reason: 'Empty message.' };
  if (chars > limit) {
    const basis = cfg.observedLimit ? `observed ${cfg.observedLimit}` : `provisional ${cfg.configuredLimit}`;
    return {
      ok: false,
      chars,
      limit,
      reason: `${chars} characters — max ${limit} (${basis} minus ${cfg.margin} margin).`,
    };
  }
  return { ok: true, chars, limit };
}

// ---------------------------------------------------------------------------
// Message edits keep history; ChatGPT proposals never replace text by themselves
// ---------------------------------------------------------------------------

const HISTORY_KEEP = 30;

/**
 * Replace the current message. The replaced text is kept in messageHistory and
 * an approval that no longer matches is invalidated. No-op when the text is the
 * same, so repeated saves never churn history or approvals.
 */
export function withMessage(
  p: Prospect,
  message: string,
  reason: MessageHistoryEntry['reason'],
  now: string = nowIso(),
): Prospect {
  const previous = finalText(p);
  if (message === previous) return p;
  const wasApproved = p.approval?.status === 'approved' && p.approval.approvedText === previous;
  const isReset = message === p.originalDraft;
  const next: Prospect = {
    ...p,
    editedMessage: isReset ? null : message,
    editedAt: isReset ? null : now,
    lastActivityAt: now,
    messageHistory: [...(p.messageHistory ?? []), { text: previous, at: now, reason, wasApproved }].slice(-HISTORY_KEEP),
  };
  return invalidateApprovalIfChanged(next);
}

/** Apply a pending proposal on explicit user choice. Invalidates a stale approval. */
export function applyProposal(p: Prospect, proposalId: string, now: string = nowIso()): Prospect {
  const proposal = (p.messageProposals ?? []).find((x) => x.id === proposalId);
  if (!proposal || proposal.status !== 'pending') return p;
  const replaced = withMessage(p, proposal.text, 'proposal_applied', now);
  return {
    ...replaced,
    messageProposals: (p.messageProposals ?? []).map((x) => (x.id === proposalId ? { ...x, status: 'applied' as const } : x)),
  };
}

export function dismissProposal(p: Prospect, proposalId: string): Prospect {
  return {
    ...p,
    messageProposals: (p.messageProposals ?? []).map((x) =>
      x.id === proposalId && x.status === 'pending' ? { ...x, status: 'dismissed' as const } : x,
    ),
  };
}

/** What a ficha still needs before it can be approved (and, later, executed). */
export function essentialGaps(p: Prospect, person: Person | undefined): string[] {
  const gaps: string[] = [];
  if (!person?.fullName?.trim()) gaps.push('nombre');
  if (!normalizeLinkedinUrl(person?.linkedinUrl)) gaps.push('URL de LinkedIn');
  if (!finalText(p).trim()) gaps.push('mensaje');
  return gaps;
}

/**
 * Merge changes written by an external writer (the optional MCP connector) into
 * the live state WITHOUT touching anything the user decided here: approvals,
 * edited messages and existing research always keep the local value. Only
 * additions are taken: new records and new message proposals.
 */
export function mergeExternalChanges(local: AppState, external: AppState): AppState {
  const ids = <T extends { id: string }>(xs: T[]) => new Set(xs.map((x) => x.id));
  const addNew = <T extends { id: string }>(have: T[], incoming: T[] | undefined) => {
    const known = ids(have);
    return [...have, ...(incoming ?? []).filter((x) => !known.has(x.id))];
  };
  const extById = new Map(external.prospects.map((p) => [p.id, p]));
  const prospects = local.prospects.map((p) => {
    const ext = extById.get(p.id);
    if (!ext?.messageProposals?.length) return p;
    const have = new Set((p.messageProposals ?? []).map((x) => x.id));
    const incoming = ext.messageProposals.filter((x) => !have.has(x.id)).map((x) => ({ ...x, status: 'pending' as const }));
    return incoming.length ? { ...p, messageProposals: [...(p.messageProposals ?? []), ...incoming] } : p;
  });
  return {
    ...local,
    companies: addNew(local.companies, external.companies),
    people: addNew(local.people, external.people),
    prospects: addNew(prospects, external.prospects),
    activities: addNew(local.activities, external.activities),
    researchTasks: addNew(local.researchTasks ?? [], external.researchTasks),
    importHistory: addNew(local.importHistory ?? [], external.importHistory),
  };
}

export function approveProspect(p: Prospect, cfg: ChannelLimitConfig): Prospect {
  const text = finalText(p);
  const check = checkApprovable(text, cfg);
  if (!check.ok) throw new Error(check.reason);
  return {
    ...p,
    approval: { status: 'approved', approvedText: text, approvedAt: nowIso() },
    lastActivityAt: nowIso(),
  };
}

export function discardProspect(p: Prospect): Prospect {
  return {
    ...p,
    approval: { status: 'discarded', approvedText: null, approvedAt: null },
    lastActivityAt: nowIso(),
  };
}

export function setPendingProspect(p: Prospect): Prospect {
  return { ...p, approval: { status: 'pending', approvedText: null, approvedAt: null } };
}

/** An edit after approval invalidates it (the approved copy no longer matches). */
export function invalidateApprovalIfChanged(p: Prospect): Prospect {
  if (p.approval?.status === 'approved' && p.approval.approvedText !== finalText(p)) {
    return { ...p, approval: { status: 'pending', approvedText: null, approvedAt: null } };
  }
  return p;
}

export function approvedForCampaign(state: AppState, campaignId: string): Prospect[] {
  return state.prospects.filter(
    (p) =>
      p.campaignId === campaignId &&
      p.approval?.status === 'approved' &&
      p.approval.approvedText === finalText(p) &&
      !alreadyInOpenBatch(state, p.id),
  );
}

function alreadyInOpenBatch(state: AppState, prospectId: string): boolean {
  return (state.batches ?? []).some(
    (b) =>
      ['frozen', 'running', 'paused'].includes(b.status) &&
      b.recipients.some((r) => r.prospectId === prospectId),
  );
}

// ---------------------------------------------------------------------------
// Batches: frozen recipients + frozen messages, event history, single queue
// ---------------------------------------------------------------------------

export function senderAccountOf(state: AppState, workspaceId: string): string {
  return state.workspaces.find((w) => w.id === workspaceId)?.senderAccountId ?? 'default-account';
}

export function freezeBatch(state: AppState, campaignId: string, mode: 'dry_run' | 'live'): Batch {
  const campaign = (state.campaigns ?? []).find((c) => c.id === campaignId);
  if (!campaign) throw new Error('Campaign not found.');
  const approved = approvedForCampaign(state, campaignId);
  if (approved.length === 0) throw new Error('No approved messages to send.');
  const recipients: BatchRecipient[] = approved.map((p) => {
    const person = state.people.find((x) => x.id === p.personId);
    return {
      prospectId: p.id,
      personName: person?.fullName ?? p.personId,
      profileUrl: person?.linkedinUrl ?? '',
      frozenMessage: p.approval!.approvedText!,
    };
  });
  return {
    id: uid(),
    campaignId,
    workspaceId: campaign.workspaceId,
    senderAccountId: senderAccountOf(state, campaign.workspaceId),
    mode,
    status: 'frozen',
    recipients,
    createdAt: nowIso(),
    startedAt: null,
    finishedAt: null,
  };
}

/** One batch at a time per sender account (shared across campaigns/workspaces). */
export function canStartBatch(state: AppState, batchId: string): { ok: boolean; reason?: string } {
  const batch = (state.batches ?? []).find((b) => b.id === batchId);
  if (!batch) return { ok: false, reason: 'Batch not found.' };
  const lock = (state.executionLocks ?? {})[batch.senderAccountId];
  if (lock && lock.batchId !== batchId) {
    return { ok: false, reason: `Another batch (${lock.batchId.slice(0, 8)}…) is running on this account.` };
  }
  if (!['frozen', 'paused'].includes(batch.status)) {
    return { ok: false, reason: `Batch is ${batch.status}.` };
  }
  return { ok: true };
}

/** Daily cap shared by every campaign of the sender account (live sends only). */
export function sentTodayForAccount(state: AppState, senderAccountId: string): number {
  const today = new Date().toDateString();
  return (state.batchEvents ?? []).filter(
    (e) =>
      e.senderAccountId === senderAccountId &&
      e.kind === 'result' &&
      e.status === 'sent' &&
      e.mode === 'live' &&
      new Date(e.at).toDateString() === today,
  ).length;
}

// --- event history ------------------------------------------------------

const TERMINAL: RecipientResultStatus[] = ['sent', 'already_connected', 'pending_invitation', 'skipped'];

/** Current state of a recipient, derived from its event history. */
export function recipientState(
  events: BatchEvent[],
  batchId: string,
  prospectId: string,
): { status: RecipientResultStatus | null; resolved: boolean; lastEvent?: BatchEvent } {
  const mine = events
    .filter((e) => e.batchId === batchId && e.prospectId === prospectId)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (mine.length === 0) return { status: null, resolved: false };
  // Latest result/verification decides; a confirmed send is final forever.
  let status: RecipientResultStatus | null = null;
  for (const e of mine) {
    if (e.kind === 'result' || e.kind === 'verification') status = e.status;
    if (e.status === 'sent') {
      status = 'sent';
      break;
    }
  }
  const resolved = status != null && TERMINAL.includes(status);
  return { status, resolved, lastEvent: mine[mine.length - 1] };
}

/**
 * Append an event idempotently (same eventId is never processed twice).
 * A `result` on an already-resolved recipient is rejected; `verification`
 * events may resolve an uncertain/error outcome later.
 */
export function appendBatchEvent(
  state: AppState,
  event: Omit<BatchEvent, 'at'> & { at?: string },
): { state: AppState; applied: boolean; reason?: string } {
  const events = state.batchEvents ?? [];
  if (events.some((e) => e.id === event.id)) {
    return { state, applied: false, reason: 'duplicate event id' };
  }
  const current = recipientState(events, event.batchId, event.prospectId);
  if (event.kind === 'result' && current.resolved) {
    return { state, applied: false, reason: `recipient already ${current.status}` };
  }
  if (event.kind === 'action' && current.status === 'sent') {
    return { state, applied: false, reason: 'confirmed send is never re-executed' };
  }
  const full: BatchEvent = { ...event, at: event.at ?? nowIso() };
  const nextEvents = [...events, full];

  // Mirror the derived state onto the batch recipient for convenient display.
  const derived = recipientState(nextEvents, event.batchId, event.prospectId);
  const batches = (state.batches ?? []).map((b) =>
    b.id === event.batchId
      ? {
          ...b,
          recipients: b.recipients.map((r) =>
            r.prospectId === event.prospectId && derived.status
              ? {
                  ...r,
                  result: {
                    status: derived.status,
                    detail: full.detail,
                    at: full.at,
                    verifiedBeforeAction: full.verifiedBeforeAction ?? false,
                    resolved: derived.resolved,
                  },
                }
              : r,
          ),
        }
      : b,
  );

  // Pipeline update during execution (live mode moves real statuses).
  const batch = batches.find((b) => b.id === event.batchId);
  const prospects = state.prospects.map((p) => {
    if (p.id !== event.prospectId || batch?.mode !== 'live') return p;
    if (full.status === 'sent') {
      const frozen = batch.recipients.find((r) => r.prospectId === p.id)?.frozenMessage ?? null;
      return { ...p, status: 'connection_sent' as const, sentAt: full.at, finalMessage: frozen, lastActivityAt: full.at };
    }
    if (full.status === 'already_connected') {
      return { ...p, status: 'connection_accepted' as const, lastActivityAt: full.at };
    }
    return { ...p, lastActivityAt: full.at };
  });

  return { state: { ...state, batchEvents: nextEvents, batches, prospects }, applied: true };
}

export function batchSummary(batch: Batch): NonNullable<Batch['summary']> {
  const s = { completed: 0, skipped: 0, pending: 0, errors: 0 };
  for (const r of batch.recipients) {
    const st = r.result?.status;
    if (!st) s.pending++;
    else if (st === 'sent' || st === 'already_connected') s.completed++;
    else if (st === 'error' || st === 'uncertain') s.errors++;
    else s.skipped++;
  }
  return s;
}

/** Recipients that still need work: no result, or an unresolved (uncertain/error) one. */
export function pendingRecipients(batch: Batch): BatchRecipient[] {
  return batch.recipients.filter((r) => !r.result || !r.result.resolved);
}

export function collectedToResearch(c: CollectedProfile) {
  return {
    verifiedFacts: [
      c.fullName ? `Name: ${c.fullName}` : null,
      c.headline ? `Headline: ${c.headline}` : null,
      c.company ? `Company: ${c.company}` : null,
    ].filter((x): x is string => Boolean(x)),
    inferences: [] as string[],
    posts: c.posts,
    activityChecked: c.activityChecked,
    suggestedOpener: '',
    photoUrl: c.photoUrl,
    sources: [c.profileUrl, ...c.posts.map((p) => p.url)],
  };
}
