// One-shot importer: prototype backup JSON → Supabase, without data loss.
//
// Every id is remapped to a fresh UUID before insert. Prototype ids are
// deterministic (ws-impact-hydrogen, pr-pe-01, …) and identical across every
// prototype install, while Postgres primary keys are global — importing
// verbatim would collide across users. Foreign keys are remapped consistently.

import type { AppState } from './types';
import { isValidBackup, migrateState, replaceState, setActiveWorkspace } from './store';
import { supabase } from './supabaseClient';
import { hydrateFromSupabase } from './sync/engine';
import {
  activityToRow,
  alertToRow,
  companyToRow,
  followUpToRow,
  opportunityToRow,
  personToRow,
  prospectToRow,
  sourceToRow,
  workspaceToRow,
  type Row,
} from './sync/mappers';
import { uid } from './utils';

export interface BackupImportResult {
  workspaces: number;
  companies: number;
  people: number;
  prospects: number;
  activities: number;
  followUps: number;
  opportunities: number;
  sources: number;
  alerts: number;
}

const CHUNK = 200;

async function insertRows(table: string, rows: Row[]): Promise<void> {
  if (!supabase) throw new Error('Backup import requires cloud mode.');
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

/** Validate + migrate a parsed backup payload; throws with a clear message. */
export function parseBackup(payload: unknown): AppState {
  if (!isValidBackup(payload)) {
    throw new Error('Not a valid Prospecting Copilot backup file.');
  }
  return migrateState(payload);
}

export async function importBackupToCloud(
  payload: unknown,
  userId: string,
): Promise<BackupImportResult> {
  const backup = parseBackup(payload);

  // Fresh ids for everything; FKs remapped through the same table.
  const idMap = new Map<string, string>();
  const remap = (oldId: string): string => {
    if (!idMap.has(oldId)) idMap.set(oldId, uid());
    return idMap.get(oldId)!;
  };

  const workspaces = backup.workspaces.map((w) => ({ ...w, id: remap(w.id) }));
  const companies = backup.companies.map((c) => ({ ...c, id: remap(c.id) }));
  const people = backup.people.map((p) => ({
    ...p,
    id: remap(p.id),
    companyId: p.companyId ? remap(p.companyId) : '',
  }));
  const prospects = backup.prospects.map((p) => ({
    ...p,
    id: remap(p.id),
    workspaceId: remap(p.workspaceId),
    personId: remap(p.personId),
    companyId: p.companyId ? remap(p.companyId) : '',
  }));
  const activities = backup.activities
    .filter((a) => backup.prospects.some((p) => p.id === a.prospectId))
    .map((a) => ({ ...a, id: remap(a.id), prospectId: remap(a.prospectId) }));
  const followUps = backup.followUps
    .filter((f) => backup.prospects.some((p) => p.id === f.prospectId))
    .map((f) => ({ ...f, id: remap(f.id), prospectId: remap(f.prospectId) }));
  const opportunities = backup.opportunities.map((o) => ({ ...o, id: remap(o.id) }));
  const sources = backup.opportunitySources.map((s) => ({ ...s, id: remap(s.id) }));
  const alerts = backup.opportunityAlerts.map((a) => ({ ...a, id: remap(a.id) }));

  // Workspace scoping for entities the client model doesn't scope directly.
  const prospectWs = new Map(prospects.map((p) => [p.id, p.workspaceId]));
  const companyWs = new Map<string, string>();
  const personWs = new Map<string, string>();
  for (const p of prospects) {
    if (p.companyId) companyWs.set(p.companyId, p.workspaceId);
    personWs.set(p.personId, p.workspaceId);
  }
  const primaryWs =
    (backup.activeWorkspaceId && remap(backup.activeWorkspaceId)) || workspaces[0]?.id || '';

  await insertRows(
    'workspaces',
    workspaces.map((w) => ({ ...workspaceToRow(w), owner_id: userId })),
  );
  await insertRows(
    'companies',
    companies.map((c) => companyToRow(c, companyWs.get(c.id) ?? primaryWs)),
  );
  await insertRows(
    'people',
    people.map((p) => personToRow(p, personWs.get(p.id) ?? primaryWs)),
  );
  await insertRows('prospects', prospects.map(prospectToRow));
  await insertRows(
    'activities',
    activities.map((a) => activityToRow(a, prospectWs.get(a.prospectId) ?? primaryWs)),
  );
  await insertRows(
    'follow_ups',
    followUps.map((f) => followUpToRow(f, prospectWs.get(f.prospectId) ?? primaryWs)),
  );
  await insertRows(
    'opportunities',
    opportunities.map((o) => opportunityToRow(o, primaryWs)),
  );
  await insertRows(
    'opportunity_sources',
    sources.map((s) => sourceToRow(s, primaryWs)),
  );
  await insertRows(
    'opportunity_alerts',
    alerts.map((a) => alertToRow(a, primaryWs)),
  );

  // Refresh the client from the server so ids/baselines are consistent.
  const hydrated = await hydrateFromSupabase();
  replaceState(hydrated);
  if (primaryWs) setActiveWorkspace(primaryWs);

  return {
    workspaces: workspaces.length,
    companies: companies.length,
    people: people.length,
    prospects: prospects.length,
    activities: activities.length,
    followUps: followUps.length,
    opportunities: opportunities.length,
    sources: sources.length,
    alerts: alerts.length,
  };
}
