// Application store: a small observable state container persisted to browser
// local storage. No backend, no network — everything stays on this device.

import { useSyncExternalStore } from 'react';
import type {
  Activity,
  ActivityType,
  AppState,
  Company,
  FollowUp,
  Person,
  Prospect,
  ProspectStatus,
  Workspace,
} from './types';
import type { Opportunity, OpportunityAlert, OpportunitySource } from './opportunityTypes';
import { buildDemoState } from '../data/demoData';
import { isCloudMode } from './supabaseClient';
import { emptyCloudState } from './sync/mappers';
import { sanitizeForPersist } from './secretsGuard';
import { nowIso, uid } from './utils';

export const STORAGE_KEY = 'prospecting-copilot-state-v1';

let state: AppState = loadInitialState();
const listeners = new Set<() => void>();

/** Migrate v1 state (pre-Opportunities) to v2 by adding the new collections. */
export function migrateState(parsed: AppState): AppState {
  if (parsed.version >= 2) return parsed;
  const demo = buildDemoState();
  return {
    ...parsed,
    version: 2,
    opportunities: parsed.opportunities ?? demo.opportunities,
    opportunitySources: parsed.opportunitySources ?? demo.opportunitySources,
    opportunityAlerts: parsed.opportunityAlerts ?? [],
  };
}

function loadInitialState(): AppState {
  // Cloud mode: start empty; AuthGate hydrates from Supabase after login.
  // localStorage acts as offline cache between sessions.
  if (typeof localStorage === 'undefined') {
    return isCloudMode() ? emptyCloudState() : buildDemoState();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return persist(isCloudMode() ? emptyCloudState() : buildDemoState());
    const parsed = JSON.parse(raw) as AppState;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.version !== 'number' ||
      parsed.version < 1 ||
      parsed.version > 2 ||
      !Array.isArray(parsed.prospects)
    ) {
      return persist(buildDemoState());
    }
    return persist(migrateState(parsed));
  } catch {
    return persist(buildDemoState());
  }
}

function persist(next: AppState): AppState {
  try {
    // Security invariant: the persisted client state must never contain
    // provider credentials or anything matching an Anthropic API key.
    localStorage.setItem(STORAGE_KEY, sanitizeForPersist(next));
  } catch {
    // Storage full or unavailable — keep working in memory.
  }
  return next;
}

export function getState(): AppState {
  return state;
}

export function setState(updater: (prev: AppState) => AppState): void {
  state = persist(updater(state));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** External subscription point for the cloud sync engine. */
export function subscribeToStore(listener: () => void): () => void {
  return subscribe(listener);
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function activeWorkspace(s: AppState): Workspace {
  return s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? s.workspaces[0]!;
}

export function personById(s: AppState, id: string): Person | undefined {
  return s.people.find((p) => p.id === id);
}

export function companyById(s: AppState, id: string): Company | undefined {
  return s.companies.find((c) => c.id === id);
}

export function prospectById(s: AppState, id: string): Prospect | undefined {
  return s.prospects.find((p) => p.id === id);
}

export function workspaceProspects(s: AppState): Prospect[] {
  return s.prospects.filter((p) => p.workspaceId === s.activeWorkspaceId);
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

export function logActivity(
  prospectId: string,
  type: ActivityType,
  notes: string,
  previousStatus: ProspectStatus | null = null,
  newStatus: ProspectStatus | null = null,
): Activity {
  return {
    id: uid(),
    prospectId,
    type,
    previousStatus,
    newStatus,
    notes,
    createdAt: nowIso(),
  };
}

export function changeStatus(prospectId: string, newStatus: ProspectStatus, note = ''): void {
  setState((prev) => {
    const prospect = prev.prospects.find((p) => p.id === prospectId);
    if (!prospect || prospect.status === newStatus) return prev;
    const activity = logActivity(prospectId, 'status_change', note, prospect.status, newStatus);
    const now = nowIso();
    return {
      ...prev,
      prospects: prev.prospects.map((p) =>
        p.id === prospectId
          ? {
              ...p,
              status: newStatus,
              lastActivityAt: now,
              sentAt: newStatus === 'connection_sent' && !p.sentAt ? now : p.sentAt,
              reviewedAt: p.reviewedAt ?? now,
              finalMessage:
                newStatus === 'connection_sent'
                  ? (p.editedMessage ?? p.originalDraft)
                  : p.finalMessage,
            }
          : p,
      ),
      activities: [...prev.activities, activity],
    };
  });
}

export function markSent(prospectId: string): void {
  setState((prev) => {
    const prospect = prev.prospects.find((p) => p.id === prospectId);
    if (!prospect) return prev;
    const now = nowIso();
    const finalMessage = prospect.editedMessage ?? prospect.originalDraft;
    const activity = logActivity(
      prospectId,
      'marked_sent',
      'Connection request marked as sent (manually, via LinkedIn).',
      prospect.status,
      'connection_sent',
    );
    return {
      ...prev,
      prospects: prev.prospects.map((p) =>
        p.id === prospectId
          ? {
              ...p,
              status: 'connection_sent',
              finalMessage,
              sentAt: now,
              reviewedAt: p.reviewedAt ?? now,
              lastActivityAt: now,
            }
          : p,
      ),
      activities: [...prev.activities, activity],
    };
  });
}

/** Skip: prospect returns to the pool ("new") and leaves today's queue. */
export function skipProspect(prospectId: string): void {
  setState((prev) => {
    const prospect = prev.prospects.find((p) => p.id === prospectId);
    if (!prospect) return prev;
    const now = nowIso();
    const activity = logActivity(
      prospectId,
      'skipped',
      'Skipped during review.',
      prospect.status,
      'new',
    );
    return {
      ...prev,
      prospects: prev.prospects.map((p) =>
        p.id === prospectId ? { ...p, status: 'new', reviewedAt: now, lastActivityAt: now } : p,
      ),
      activities: [...prev.activities, activity],
    };
  });
}

// ---------------------------------------------------------------------------
// Message lifecycle
// ---------------------------------------------------------------------------

export function saveMessage(prospectId: string, message: string): void {
  setState((prev) => {
    const prospect = prev.prospects.find((p) => p.id === prospectId);
    if (!prospect) return prev;
    const now = nowIso();
    const isReset = message === prospect.originalDraft;
    const activity = logActivity(
      prospectId,
      isReset ? 'message_reset' : 'message_edited',
      isReset ? 'Message reset to original draft.' : 'Message edited.',
    );
    return {
      ...prev,
      prospects: prev.prospects.map((p) =>
        p.id === prospectId
          ? {
              ...p,
              editedMessage: isReset ? null : message,
              editedAt: isReset ? null : now,
              lastActivityAt: now,
            }
          : p,
      ),
      activities: [...prev.activities, activity],
    };
  });
}

export function addNote(prospectId: string, note: string): void {
  setState((prev) => {
    const activity = logActivity(prospectId, 'note_added', note);
    return {
      ...prev,
      prospects: prev.prospects.map((p) =>
        p.id === prospectId ? { ...p, notes: note, lastActivityAt: nowIso() } : p,
      ),
      activities: [...prev.activities, activity],
    };
  });
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

export function createFollowUp(prospectId: string, dueAt: string, message: string): void {
  setState((prev) => ({
    ...prev,
    followUps: [
      ...prev.followUps,
      { id: uid(), prospectId, dueAt, status: 'pending', message, completedAt: null },
    ],
    activities: [...prev.activities, logActivity(prospectId, 'follow_up_created', message)],
  }));
}

export function updateFollowUp(id: string, patch: Partial<FollowUp>): void {
  setState((prev) => ({
    ...prev,
    followUps: prev.followUps.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  }));
}

export function completeFollowUp(id: string): void {
  setState((prev) => {
    const fu = prev.followUps.find((f) => f.id === id);
    if (!fu) return prev;
    return {
      ...prev,
      followUps: prev.followUps.map((f) =>
        f.id === id ? { ...f, status: 'completed', completedAt: nowIso() } : f,
      ),
      activities: [
        ...prev.activities,
        logActivity(fu.prospectId, 'follow_up_completed', fu.message),
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// Workspace / data management
// ---------------------------------------------------------------------------

export function setActiveWorkspace(id: string): void {
  setState((prev) => ({ ...prev, activeWorkspaceId: id }));
}

export function updateWorkspace(id: string, patch: Partial<Workspace>): void {
  setState((prev) => ({
    ...prev,
    workspaces: prev.workspaces.map((w) => (w.id === id ? { ...w, ...patch } : w)),
  }));
}

export function updateCompany(id: string, patch: Partial<Company>): void {
  setState((prev) => ({
    ...prev,
    companies: prev.companies.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  }));
}

export function addEntities(entities: {
  companies?: Company[];
  people?: Person[];
  prospects?: Prospect[];
  activities?: Activity[];
}): void {
  setState((prev) => ({
    ...prev,
    companies: entities.companies?.length
      ? [...prev.companies, ...entities.companies]
      : prev.companies,
    people: entities.people?.length ? [...prev.people, ...entities.people] : prev.people,
    prospects: entities.prospects?.length
      ? [...prev.prospects, ...entities.prospects]
      : prev.prospects,
    activities: entities.activities?.length
      ? [...prev.activities, ...entities.activities]
      : prev.activities,
  }));
}

export function resetDemoData(): void {
  setState(() => buildDemoState());
}

export function replaceState(next: AppState): void {
  setState(() => migrateState(next));
}

/** Validate a parsed backup before importing it (v1 backups are migrated). */
export function isValidBackup(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    (v.version === 1 || v.version === 2) &&
    typeof v.activeWorkspaceId === 'string' &&
    Array.isArray(v.workspaces) &&
    Array.isArray(v.companies) &&
    Array.isArray(v.people) &&
    Array.isArray(v.prospects) &&
    Array.isArray(v.activities) &&
    Array.isArray(v.followUps)
  );
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------

export function addOpportunity(opportunity: Opportunity): void {
  setState((prev) => ({ ...prev, opportunities: [opportunity, ...prev.opportunities] }));
}

export function updateOpportunity(id: string, patch: Partial<Opportunity>, event?: string): void {
  setState((prev) => ({
    ...prev,
    opportunities: prev.opportunities.map((o) =>
      o.id === id
        ? {
            ...o,
            ...patch,
            history: event ? [...o.history, { at: nowIso(), event }] : o.history,
          }
        : o,
    ),
  }));
}

export function changeOpportunityStatus(id: string, status: Opportunity['status']): void {
  setState((prev) => ({
    ...prev,
    opportunities: prev.opportunities.map((o) =>
      o.id === id && o.status !== status
        ? {
            ...o,
            status,
            history: [
              ...o.history,
              { at: nowIso(), event: `Status changed to ${status.replace(/_/g, ' ')}.` },
            ],
          }
        : o,
    ),
  }));
}

export function toggleOpportunitySaved(id: string): void {
  setState((prev) => ({
    ...prev,
    opportunities: prev.opportunities.map((o) =>
      o.id === id
        ? {
            ...o,
            saved: !o.saved,
            history: [
              ...o.history,
              { at: nowIso(), event: o.saved ? 'Removed from saved.' : 'Saved.' },
            ],
          }
        : o,
    ),
  }));
}

export function addOpportunitySource(source: OpportunitySource): void {
  setState((prev) => ({ ...prev, opportunitySources: [...prev.opportunitySources, source] }));
}

export function updateOpportunitySource(id: string, patch: Partial<OpportunitySource>): void {
  setState((prev) => ({
    ...prev,
    opportunitySources: prev.opportunitySources.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  }));
}

export function removeOpportunitySource(id: string): void {
  setState((prev) => ({
    ...prev,
    opportunitySources: prev.opportunitySources.filter((s) => s.id !== id),
  }));
}

export function addOpportunityAlert(alert: OpportunityAlert): void {
  setState((prev) => ({ ...prev, opportunityAlerts: [...prev.opportunityAlerts, alert] }));
}

export function removeOpportunityAlert(id: string): void {
  setState((prev) => ({
    ...prev,
    opportunityAlerts: prev.opportunityAlerts.filter((a) => a.id !== id),
  }));
}
