// Store actions for the campaign-driven flow. Thin wrappers over the pure
// transitions in campaigns.ts, persisted through the normal store pipeline.

import { getState, logActivity, setState } from './store';
import type {
  AppState,
  Batch,
  BatchEvent,
  Campaign,
  CollectedProfile,
  Company,
  ImportRecord,
  Person,
  Prospect,
  ResearchTask,
  ResearchTaskStatus,
} from './types';
import {
  appendBatchEvent,
  applyProposal,
  approveProspect,
  batchSummary,
  canStartBatch,
  channelLimitFor,
  collectedToResearch,
  dedupeVerdict,
  discardProspect,
  dismissProposal,
  essentialGaps,
  freezeBatch,
  newCampaign,
  newResearchTask,
  pendingRecipients,
  setPendingProspect,
} from './campaigns';
import { applyImport, previewImport, type ImportPreview, type PreviewContext } from './batchExchange';
import { normalizeLinkedinUrl } from './dedupe';
import { computeScore, normalizeSeniority, priorityForScore } from './scoring';
import { firstNameOf, lastNameOf, nowIso, uid } from './utils';

// --- campaigns --------------------------------------------------------------

export function createCampaign(workspaceId: string, input: Partial<Campaign> & { name: string }): Campaign {
  const campaign = newCampaign(workspaceId, input);
  setState((prev) => ({ ...prev, campaigns: [...(prev.campaigns ?? []), campaign] }));
  return campaign;
}

export function updateCampaign(id: string, patch: Partial<Campaign>): void {
  setState((prev) => ({
    ...prev,
    campaigns: (prev.campaigns ?? []).map((c) =>
      c.id === id ? { ...c, ...patch, updatedAt: nowIso() } : c,
    ),
  }));
}

// --- research tasks -----------------------------------------------------------

export function createResearchTask(campaignId: string, directive: string, seeds: string[]): ResearchTask {
  const task = newResearchTask(campaignId, directive, seeds);
  setState((prev) => ({ ...prev, researchTasks: [...(prev.researchTasks ?? []), task] }));
  return task;
}

export function setResearchTaskStatus(id: string, status: ResearchTaskStatus, event: string): void {
  setState((prev) => ({
    ...prev,
    researchTasks: (prev.researchTasks ?? []).map((t) =>
      t.id === id
        ? { ...t, status, updatedAt: nowIso(), log: [...t.log, { at: nowIso(), event }] }
        : t,
    ),
  }));
}

export function addCollectedProfiles(taskId: string, profiles: CollectedProfile[]): void {
  setState((prev) => ({
    ...prev,
    researchTasks: (prev.researchTasks ?? []).map((t) =>
      t.id === taskId
        ? {
            ...t,
            collected: [...t.collected, ...profiles],
            status: 'ready_for_analysis',
            updatedAt: nowIso(),
            log: [...t.log, { at: nowIso(), event: `Collected ${profiles.length} profile(s).` }],
          }
        : t,
    ),
  }));
}

// --- proposals → fichas (what ChatGPT writes through the MCP tools) ---------------

export interface CandidateProposal {
  fullName: string;
  title: string;
  company: string;
  country?: string;
  linkedinUrl?: string;
  whyFit: string;
  verifiedFacts?: string[];
  inferences?: string[];
  posts?: { url: string; date?: string; title?: string; source: 'linkedin' | 'web' }[];
  activityChecked?: boolean;
  suggestedOpener?: string;
  draftMessage: string;
  photoUrl?: string;
}

export interface ProposalOutcome {
  created: string[];
  skippedHardDuplicates: string[];
  possibleDuplicates: string[];
}

/** Turn proposals into real CRM records (person + company + prospect ficha). */
export function saveProposals(taskId: string, proposals: CandidateProposal[]): ProposalOutcome {
  const outcome: ProposalOutcome = { created: [], skippedHardDuplicates: [], possibleDuplicates: [] };
  setState((prev) => {
    const task = (prev.researchTasks ?? []).find((t) => t.id === taskId);
    const campaign = task ? (prev.campaigns ?? []).find((c) => c.id === task.campaignId) : undefined;
    if (!task || !campaign) return prev;
    const workspace = prev.workspaces.find((w) => w.id === campaign.workspaceId)!;
    let next: AppState = prev;
    const companies: Company[] = [];
    const people: Person[] = [];
    const prospects: Prospect[] = [];
    const activities = [];

    for (const c of proposals) {
      const verdict = dedupeVerdict(
        { ...next, companies: [...next.companies, ...companies], people: [...next.people, ...people] },
        { fullName: c.fullName, companyName: c.company, linkedinUrl: c.linkedinUrl },
      );
      if (verdict.hardDuplicate) {
        outcome.skippedHardDuplicates.push(c.fullName);
        continue;
      }
      let company =
        [...next.companies, ...companies].find((x) => x.name.toLowerCase() === c.company.toLowerCase());
      if (!company) {
        company = {
          id: uid(), name: c.company, website: '', industry: '', city: '', country: c.country ?? '',
          size: '', type: '', description: '', relevantInitiatives: [], commercialTrigger: '', score: 0,
          notes: '', isDemo: false,
        };
        companies.push(company);
      }
      const person: Person = {
        id: uid(), fullName: c.fullName, firstName: firstNameOf(c.fullName), lastName: lastNameOf(c.fullName),
        title: c.title, companyId: company.id, city: '', country: c.country ?? '', linkedinUrl: c.linkedinUrl ?? '',
        seniority: normalizeSeniority(c.title), functionalArea: '', professionalSummary: c.whyFit,
        careerSummary: '', researchConfidence: c.activityChecked ? 'high' : 'medium',
        sourceReferences: ['Proposal via research task ' + taskId.slice(0, 8)], isDemo: false,
      };
      people.push(person);
      const { score, breakdown } = computeScore(person, company, workspace);
      const now = nowIso();
      const prospect: Prospect = {
        id: uid(), workspaceId: campaign.workspaceId, personId: person.id, companyId: company.id,
        status: 'ready_for_review', priority: priorityForScore(score), score, scoreBreakdown: breakdown,
        fitReason: c.whyFit, timingReason: '', outreachAngle: c.suggestedOpener ?? '', recommendedService: '',
        patternId: 'proposal', originalDraft: c.draftMessage, editedMessage: null, finalMessage: null,
        notes: verdict.possibleDuplicate ? '⚠ Possible duplicate (same name + company). Review before contacting.' : '',
        createdAt: now, reviewedAt: null, editedAt: null, sentAt: null, lastActivityAt: now, outcome: null,
        isDemo: false, campaignId: campaign.id,
        approval: { status: 'pending', approvedText: null, approvedAt: null },
        research: {
          verifiedFacts: c.verifiedFacts ?? [], inferences: c.inferences ?? [], posts: c.posts ?? [],
          activityChecked: c.activityChecked ?? false, suggestedOpener: c.suggestedOpener ?? '',
          photoUrl: c.photoUrl, sources: [c.linkedinUrl, ...(c.posts ?? []).map((p) => p.url)].filter((x): x is string => Boolean(x)),
        },
      };
      prospects.push(prospect);
      activities.push(logActivity(prospect.id, 'created', 'Ficha created from a research proposal.', null, 'ready_for_review'));
      outcome.created.push(prospect.id);
      if (verdict.possibleDuplicate) outcome.possibleDuplicates.push(c.fullName);
    }
    next = {
      ...next,
      companies: [...next.companies, ...companies],
      people: [...next.people, ...people],
      prospects: [...next.prospects, ...prospects],
      activities: [...next.activities, ...activities],
      researchTasks: (next.researchTasks ?? []).map((t) =>
        t.id === taskId
          ? { ...t, status: 'proposals_received', updatedAt: nowIso(), log: [...t.log, { at: nowIso(), event: `${prospects.length} proposal(s) saved as fichas.` }] }
          : t,
      ),
    };
    return next;
  });
  return outcome;
}

/** Attach collector output to an existing prospect's research block. */
export function attachCollectedToProspect(prospectId: string, collected: CollectedProfile): void {
  setState((prev) => ({
    ...prev,
    prospects: prev.prospects.map((p) =>
      p.id === prospectId ? { ...p, research: { ...(p.research ?? collectedToResearch(collected)), ...collectedToResearch(collected) } } : p,
    ),
  }));
}

// --- approval -------------------------------------------------------------------

export function approve(prospectId: string): void {
  const cur = getState();
  const target = cur.prospects.find((p) => p.id === prospectId);
  if (target) {
    const gaps = essentialGaps(target, cur.people.find((x) => x.id === target.personId));
    if (gaps.length > 0) throw new Error(`No se puede aprobar: falta ${gaps.join(', ')}.`);
  }
  setState((prev) => ({
    ...prev,
    prospects: prev.prospects.map((p) => (p.id === prospectId ? approveProspect(p, channelLimitFor(prev)) : p)),
  }));
}
export function discard(prospectId: string): void {
  setState((prev) => ({ ...prev, prospects: prev.prospects.map((p) => (p.id === prospectId ? discardProspect(p) : p)) }));
}
export function setPending(prospectId: string): void {
  setState((prev) => ({ ...prev, prospects: prev.prospects.map((p) => (p.id === prospectId ? setPendingProspect(p) : p)) }));
}

export function setObservedLimit(observedLimit: number): void {
  setState((prev) => ({
    ...prev,
    channelLimits: {
      linkedin_invite: { ...channelLimitFor(prev), observedLimit, observedAt: nowIso() },
    },
  }));
}

// --- batches ----------------------------------------------------------------------

export function createBatch(campaignId: string, mode: 'dry_run' | 'live'): Batch {
  const batch = freezeBatch(getState(), campaignId, mode);
  setState((prev) => ({ ...prev, batches: [...(prev.batches ?? []), batch] }));
  return batch;
}

export function startBatch(batchId: string): void {
  const check = canStartBatch(getState(), batchId);
  if (!check.ok) throw new Error(check.reason);
  setState((prev) => {
    const batch = (prev.batches ?? []).find((b) => b.id === batchId)!;
    return {
      ...prev,
      executionLocks: { ...(prev.executionLocks ?? {}), [batch.senderAccountId]: { batchId, startedAt: nowIso() } },
      batches: (prev.batches ?? []).map((b) =>
        b.id === batchId ? { ...b, status: 'running', startedAt: b.startedAt ?? nowIso() } : b,
      ),
    };
  });
}

export function recordBatchEvent(event: Omit<BatchEvent, 'at'> & { at?: string }): { applied: boolean; reason?: string } {
  let result: { applied: boolean; reason?: string } = { applied: false };
  setState((prev) => {
    const r = appendBatchEvent(prev, event);
    result = { applied: r.applied, reason: r.reason };
    return r.state;
  });
  return result;
}

export function finishBatch(batchId: string, status: 'completed' | 'paused' | 'failed'): void {
  setState((prev) => {
    const batch = (prev.batches ?? []).find((b) => b.id === batchId);
    if (!batch) return prev;
    const locks = { ...(prev.executionLocks ?? {}) };
    if (locks[batch.senderAccountId]?.batchId === batchId) delete locks[batch.senderAccountId];
    return {
      ...prev,
      executionLocks: locks,
      batches: (prev.batches ?? []).map((b) =>
        b.id === batchId
          ? { ...b, status, finishedAt: status === 'completed' ? nowIso() : b.finishedAt, summary: batchSummary(b) }
          : b,
      ),
    };
  });
}

export function batchPending(batchId: string) {
  const batch = (getState().batches ?? []).find((b) => b.id === batchId);
  return batch ? pendingRecipients(batch) : [];
}

// --- batch exchange with ChatGPT ------------------------------------------------------------

/** Preview a pasted/selected result against the CURRENT state (pure; nothing is saved). */
export function previewResult(rawText: string, ctx: PreviewContext): ImportPreview {
  return previewImport(getState(), rawText, ctx);
}

/**
 * Confirm an import. The preview is recomputed from the current state at the
 * moment of confirming, so a stale preview can never overwrite newer edits.
 */
export function confirmImport(rawText: string, ctx: PreviewContext): { record: ImportRecord; preview: ImportPreview } {
  const preview = previewImport(getState(), rawText, ctx);
  if (preview.fatal.length > 0) throw new Error(preview.fatal[0]);
  if (!preview.canConfirm) throw new Error('No hay nada nuevo que importar.');
  let record!: ImportRecord;
  setState((prev) => {
    const out = applyImport(prev, previewImport(prev, rawText, ctx));
    record = out.record;
    return out.state;
  });
  return { record, preview };
}

export function applyMessageProposal(prospectId: string, proposalId: string): void {
  setState((prev) => {
    const target = prev.prospects.find((p) => p.id === prospectId);
    if (!target) return prev;
    const activity = logActivity(prospectId, 'message_edited', 'Propuesta de ChatGPT aplicada por el usuario.');
    return {
      ...prev,
      prospects: prev.prospects.map((p) => (p.id === prospectId ? applyProposal(p, proposalId) : p)),
      activities: [...prev.activities, activity],
    };
  });
}

export function dismissMessageProposal(prospectId: string, proposalId: string): void {
  setState((prev) => ({
    ...prev,
    prospects: prev.prospects.map((p) => (p.id === prospectId ? dismissProposal(p, proposalId) : p)),
  }));
}

/** Complete a missing LinkedIn URL. Refuses a URL that already belongs to someone else. */
export function setProspectLinkedinUrl(prospectId: string, rawUrl: string): void {
  const url = rawUrl.trim();
  const norm = normalizeLinkedinUrl(url);
  if (!/^linkedin\.com\/(in|pub)\/[^/]+/.test(norm)) {
    throw new Error('La URL debe ser un perfil de LinkedIn (linkedin.com/in/…).');
  }
  const cur = getState();
  const prospect = cur.prospects.find((p) => p.id === prospectId);
  if (!prospect) throw new Error('Ficha no encontrada.');
  const clash = cur.people.find((x) => x.id !== prospect.personId && normalizeLinkedinUrl(x.linkedinUrl) === norm);
  if (clash) throw new Error(`Esa URL ya pertenece a ${clash.fullName}. No se asigna dos veces.`);
  setState((prev) => ({
    ...prev,
    people: prev.people.map((x) => (x.id === prospect.personId ? { ...x, linkedinUrl: url } : x)),
    prospects: prev.prospects.map((p) => (p.id === prospectId ? { ...p, lastActivityAt: nowIso() } : p)),
  }));
}

/** Configured character target (provisional until observed on the real form). */
export function setConfiguredLimit(limit: number): void {
  const value = Math.max(50, Math.min(3000, Math.round(limit)));
  setState((prev) => ({
    ...prev,
    channelLimits: { linkedin_invite: { ...channelLimitFor(prev), configuredLimit: value } },
  }));
}

/** Copy a campaign's configuration (never its fichas or tasks). */
export function duplicateCampaign(id: string): Campaign | null {
  const src = (getState().campaigns ?? []).find((c) => c.id === id);
  if (!src) return null;
  return createCampaign(src.workspaceId, {
    ...src,
    name: `${src.name} (copia)`,
    exclusions: [...src.exclusions],
    styleExamples: [...(src.styleExamples ?? [])],
    status: 'active',
  });
}

/** Log that the package/directive was prepared (it does NOT mean ChatGPT researched anything). */
export function logTaskPrepared(taskId: string, what: string): void {
  setResearchTaskStatus(taskId, 'pending', what);
}
