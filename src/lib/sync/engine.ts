// Write-through sync engine (PRODUCTIZATION_PLAN §6, steps 1–2).
//
// AppState stays the client source of truth. On login we hydrate it from
// Supabase once; afterwards every store mutation is diffed against the last
// synced snapshot and written through (upserts/deletes in FK-safe order).
// localStorage remains the offline cache; failed flushes stay queued and retry.
// Components never talk to Supabase — only this module does.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppState } from '../types';
import { getState, replaceState, setActiveWorkspace, subscribeToStore } from '../store';
import { supabase } from '../supabaseClient';
import {
  activityFromRow,
  activityToRow,
  alertFromRow,
  alertToRow,
  companyFromRow,
  companyToRow,
  emptyCloudState,
  followUpFromRow,
  followUpToRow,
  opportunityFromRow,
  opportunityToRow,
  personFromRow,
  personToRow,
  prospectFromRow,
  prospectToRow,
  rowWorkspaceId,
  sourceFromRow,
  sourceToRow,
  workspaceFromRow,
  workspaceToRow,
  type Row,
} from './mappers';
import { uid } from '../utils';

const FLUSH_DEBOUNCE_MS = 400;
const RETRY_MS = 15_000;
export const SYNC_STATUS_KEY = 'pc-sync-dirty';

type TableName =
  | 'workspaces'
  | 'companies'
  | 'people'
  | 'prospects'
  | 'activities'
  | 'follow_ups'
  | 'opportunities'
  | 'opportunity_sources'
  | 'opportunity_alerts';

// FK-safe write order.
const TABLE_ORDER: TableName[] = [
  'workspaces',
  'companies',
  'people',
  'prospects',
  'activities',
  'follow_ups',
  'opportunities',
  'opportunity_sources',
  'opportunity_alerts',
];

// Tables where client actions actually delete rows.
const DELETABLE: TableName[] = ['opportunity_sources', 'opportunity_alerts'];

interface EngineState {
  userId: string;
  /** last successfully synced row JSON per table per id */
  baseline: Map<TableName, Map<string, string>>;
  /** workspace ownership of derived-scope entities (activities, follow-ups, sources, alerts) */
  entityWorkspace: Map<string, string>;
  timer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  flushing: boolean;
  unsubscribe: (() => void) | null;
}

let engine: EngineState | null = null;

let clientOverride: SupabaseClient | null = null;

/** Test hook: run the engine against an injected client (integration tests). */
export function setSyncClientForTesting(override: SupabaseClient | null): void {
  clientOverride = override;
}

function client(): SupabaseClient {
  const c = clientOverride ?? supabase;
  if (!c) throw new Error('Sync engine requires cloud mode.');
  return c;
}

function prospectWorkspace(state: AppState, prospectId: string): string {
  return state.prospects.find((p) => p.id === prospectId)?.workspaceId ?? '';
}

/** Resolve the workspace a derived-scope entity belongs to (sticky once known). */
function scopeWorkspace(state: AppState, entityId: string, fallback: string): string {
  const known = engine?.entityWorkspace.get(entityId);
  if (known) return known;
  const ws = fallback || state.activeWorkspaceId || state.workspaces[0]?.id || '';
  if (ws && engine) engine.entityWorkspace.set(entityId, ws);
  return ws;
}

/** Compute the full row set the DB should contain for the current state. */
function computeRows(state: AppState): Map<TableName, Map<string, Row>> {
  const out = new Map<TableName, Map<string, Row>>();
  const put = (table: TableName, id: string, row: Row) => {
    if (!out.has(table)) out.set(table, new Map());
    out.get(table)!.set(id, row);
  };

  for (const w of state.workspaces) put('workspaces', w.id, workspaceToRow(w));

  // Companies/people lack workspaceId on the client: derive from prospects that
  // reference them; unreferenced ones fall back to the active workspace.
  const companyWs = new Map<string, string>();
  const personWs = new Map<string, string>();
  for (const p of state.prospects) {
    if (p.companyId) companyWs.set(p.companyId, p.workspaceId);
    personWs.set(p.personId, p.workspaceId);
  }
  const fallbackWs = state.activeWorkspaceId || state.workspaces[0]?.id || '';

  for (const c of state.companies) {
    const ws = companyWs.get(c.id) ?? scopeWorkspace(state, c.id, fallbackWs);
    if (ws) put('companies', c.id, companyToRow(c, ws));
  }
  for (const p of state.people) {
    const ws = personWs.get(p.id) ?? scopeWorkspace(state, p.id, fallbackWs);
    if (ws) put('people', p.id, personToRow(p, ws));
  }
  for (const p of state.prospects) put('prospects', p.id, prospectToRow(p));
  for (const a of state.activities) {
    const ws = prospectWorkspace(state, a.prospectId) || scopeWorkspace(state, a.id, fallbackWs);
    if (ws) put('activities', a.id, activityToRow(a, ws));
  }
  for (const f of state.followUps) {
    const ws = prospectWorkspace(state, f.prospectId) || scopeWorkspace(state, f.id, fallbackWs);
    if (ws) put('follow_ups', f.id, followUpToRow(f, ws));
  }
  for (const o of state.opportunities) {
    const ws = scopeWorkspace(state, o.id, fallbackWs);
    if (ws) put('opportunities', o.id, opportunityToRow(o, ws));
  }
  for (const s of state.opportunitySources) {
    const ws = scopeWorkspace(state, s.id, fallbackWs);
    if (ws) put('opportunity_sources', s.id, sourceToRow(s, ws));
  }
  for (const a of state.opportunityAlerts) {
    const ws = scopeWorkspace(state, a.id, fallbackWs);
    if (ws) put('opportunity_alerts', a.id, alertToRow(a, ws));
  }
  return out;
}

function markDirty(dirty: boolean): void {
  try {
    if (dirty) localStorage.setItem(SYNC_STATUS_KEY, new Date().toISOString());
    else localStorage.removeItem(SYNC_STATUS_KEY);
  } catch {
    // best effort only
  }
}

async function flush(): Promise<void> {
  if (!engine || engine.flushing) return;
  engine.flushing = true;
  try {
    const state = getState();
    const desired = computeRows(state);

    for (const table of TABLE_ORDER) {
      const rows = desired.get(table) ?? new Map<string, Row>();
      const base = engine.baseline.get(table) ?? new Map<string, string>();

      const upserts: Row[] = [];
      const newBase = new Map<string, string>();
      for (const [id, row] of rows) {
        const json = JSON.stringify(row);
        newBase.set(id, json);
        if (base.get(id) !== json) upserts.push(row);
      }

      if (upserts.length > 0) {
        if (table === 'workspaces') {
          // Never let a member's upsert rewrite owner_id: insert new rows with
          // owner_id = me, update existing rows without touching owner_id.
          for (const row of upserts) {
            const id = String(row.id);
            if (base.has(id)) {
              const patch: Row = { ...row };
              delete patch.owner_id;
              const { error } = await client().from(table).update(patch).eq('id', id);
              if (error) throw error;
            } else {
              const { error } = await client()
                .from(table)
                .insert({ ...row, owner_id: engine.userId });
              if (error) throw error;
            }
          }
        } else {
          const { error } = await client().from(table).upsert(upserts, { onConflict: 'id' });
          if (error) throw error;
        }
      }

      if (DELETABLE.includes(table)) {
        const removed = [...base.keys()].filter((id) => !rows.has(id));
        if (removed.length > 0) {
          const { error } = await client().from(table).delete().in('id', removed);
          if (error) throw error;
        }
      }

      engine.baseline.set(table, newBase);
    }
    markDirty(false);
  } catch {
    // Offline or transient failure: keep the dirty flag; retry later. The data
    // is safe in localStorage and the diff re-computes from current state.
    markDirty(true);
    if (engine && !engine.retryTimer) {
      engine.retryTimer = setTimeout(() => {
        if (engine) engine.retryTimer = null;
        void flush();
      }, RETRY_MS);
    }
  } finally {
    if (engine) engine.flushing = false;
  }
}

function scheduleFlush(): void {
  if (!engine) return;
  markDirty(true);
  if (engine.timer) clearTimeout(engine.timer);
  engine.timer = setTimeout(() => {
    if (engine) engine.timer = null;
    void flush();
  }, FLUSH_DEBOUNCE_MS);
}

/** Fetch everything the user can see (RLS scopes it) and assemble AppState. */
export async function hydrateFromSupabase(): Promise<AppState> {
  const sb = client();
  const tables = [
    'workspaces',
    'companies',
    'people',
    'prospects',
    'activities',
    'follow_ups',
    'opportunities',
    'opportunity_sources',
    'opportunity_alerts',
  ] as const;

  const results = await Promise.all(
    tables.map(async (t) => {
      const { data, error } = await sb.from(t).select('*');
      if (error) {
        // Always throw a real Error with the table name — PostgREST error
        // objects are not reliably Error instances and lose context otherwise.
        throw new Error(`Loading ${t} failed: ${error.message ?? JSON.stringify(error)}`);
      }
      return data as Row[];
    }),
  );
  const [wsRows, coRows, peRows, prRows, acRows, fuRows, opRows, srcRows, alRows] = results as [
    Row[],
    Row[],
    Row[],
    Row[],
    Row[],
    Row[],
    Row[],
    Row[],
    Row[],
  ];

  const state = emptyCloudState();
  state.workspaces = wsRows.map(workspaceFromRow);
  state.companies = coRows.map(companyFromRow);
  state.people = peRows.map(personFromRow);
  state.prospects = prRows.map(prospectFromRow);
  state.activities = acRows.map(activityFromRow);
  state.followUps = fuRows.map(followUpFromRow);
  state.opportunities = opRows.map(opportunityFromRow);
  state.opportunitySources = srcRows.map(sourceFromRow);
  state.opportunityAlerts = alRows.map(alertFromRow);

  // Remember which workspace owns each derived-scope row.
  if (engine) {
    for (const rows of [coRows, peRows, acRows, fuRows, opRows, srcRows, alRows]) {
      for (const r of rows) engine.entityWorkspace.set(String(r.id), rowWorkspaceId(r));
    }
  }

  // Keep the locally remembered active workspace when still a member.
  const remembered = getState().activeWorkspaceId;
  state.activeWorkspaceId = state.workspaces.some((w) => w.id === remembered)
    ? remembered
    : (state.workspaces[0]?.id ?? '');
  return state;
}

/** Start cloud sync for a signed-in user: hydrate, set baseline, subscribe. */
export async function startSync(userId: string): Promise<AppState> {
  stopSync();
  engine = {
    userId,
    baseline: new Map(),
    entityWorkspace: new Map(),
    timer: null,
    retryTimer: null,
    flushing: false,
    unsubscribe: null,
  };

  const hydrated = await hydrateFromSupabase();
  replaceState(hydrated);

  // Baseline = what the server already has; only future diffs get written.
  const rows = computeRows(getState());
  for (const table of TABLE_ORDER) {
    const map = new Map<string, string>();
    for (const [id, row] of rows.get(table) ?? []) map.set(id, JSON.stringify(row));
    engine.baseline.set(table, map);
  }

  engine.unsubscribe = subscribeToStore(scheduleFlush);
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => void flush());
  }
  return hydrated;
}

export function stopSync(): void {
  if (!engine) return;
  if (engine.timer) clearTimeout(engine.timer);
  if (engine.retryTimer) clearTimeout(engine.retryTimer);
  engine.unsubscribe?.();
  engine = null;
}

export function isSyncing(): boolean {
  return engine != null;
}

/** Create a workspace in the cloud and select it (first-login onboarding). */
export async function createWorkspaceCloud(name: string, userId: string): Promise<void> {
  const id = uid();
  const workspace = {
    id,
    name,
    senderName: '',
    senderTitle: '',
    senderCompany: '',
    senderBio: '',
    services: [],
    valueProposition: '',
    defaultLanguage: 'en' as const,
    defaultTone: 'professional' as const,
    preferredMessageLength: 'medium' as const,
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
  const { error } = await client()
    .from('workspaces')
    .insert({ ...workspaceToRow(workspace), owner_id: userId });
  if (error) throw error;
  const hydrated = await hydrateFromSupabase();
  replaceState(hydrated);
  setActiveWorkspace(id);
}
