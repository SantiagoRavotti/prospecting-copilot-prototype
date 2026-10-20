// End-to-end test of the HOSTED ChatGPT path with only the database faked:
// real MCP core (Edge Function), real snapshot builder and real CRM tool
// handlers (desktop relay side) operating on a real state file.

import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle, type Deps, type Snapshot } from '../../supabase/functions/crm-mcp/core';
import { buildDesktopInitialState } from '../data/campaigns';
import { newCampaign, newResearchTask } from './campaigns';

const require = createRequire(import.meta.url);
const storeFile = require('../../electron/storeFile.cjs');
const crmTools = require('../../electron/crmTools.cjs');
const { buildSnapshot } = require('../../electron/relaySnapshot.cjs');

const SUPABASE_URL = 'https://example-ref.supabase.co';
const MCP = `${SUPABASE_URL}/functions/v1/crm-mcp/mcp`;
const TOKEN = 'valid-oauth-token';

interface Row {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  status: 'pending' | 'applied' | 'failed';
  result: unknown;
}

let dir: string;
let inbox: Row[];
let snapshot: { snapshot: Snapshot; updatedAt: string } | null;
let desktopRunning: boolean;
let taskId: string;
let campaignId: string;

function publish() {
  snapshot = { snapshot: buildSnapshot(JSON.parse(storeFile.readStateSync(dir))), updatedAt: new Date().toISOString() };
}

/** What electron/relay.cjs does each poll: apply pending rows through crmTools. */
function desktopTick() {
  if (!desktopRunning) return;
  for (const row of inbox.filter((r) => r.status === 'pending')) {
    const tool = crmTools.TOOLS.find((t: { name: string }) => t.name === row.tool);
    try {
      row.result = tool.handler(dir, row.args);
      row.status = 'applied';
    } catch (e) {
      row.result = { error: (e as Error).message };
      row.status = 'failed';
    }
  }
  publish();
}

const deps: Deps = {
  supabaseUrl: SUPABASE_URL,
  verify: async (t) => (t === TOKEN ? { userId: 'user-1', clientId: 'chatgpt-client' } : null),
  getSnapshot: async () => snapshot,
  enqueue: async (_t, tool, args) => {
    const id = `row-${inbox.length + 1}`;
    inbox.push({ id, tool, args: args as Record<string, unknown>, status: 'pending', result: null });
    return id;
  },
  inboxRow: async (_t, id) => inbox.find((r) => r.id === id) ?? null,
  authServerMetadata: async () => ({ issuer: `${SUPABASE_URL}/auth/v1` }),
  sleep: async () => desktopTick(),
  writeWaitMs: 3000,
};

let rpcId = 0;
async function rpc(method: string, params?: unknown, token = TOKEN) {
  const res = await handle(
    new Request(MCP, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    }),
    deps,
  );
  return { status: res.status, body: res.status === 200 ? await res.json() : null, headers: res.headers };
}
async function callTool(name: string, args: unknown) {
  const r = await rpc('tools/call', { name, arguments: args });
  const result = r.body.result;
  const text: string = result.content[0].text;
  let data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { isError: Boolean(result.isError), data };
}

const CANDIDATES = [
  { full_name: 'Ana Real Uno', title: 'Head of E-commerce', company: 'Uno Retail', linkedin_url: 'https://www.linkedin.com/in/ana-real-uno/', why_fit: 'Lidera e-commerce', verified_facts: ['Perfil público: Head of E-commerce (linkedin.com/in/ana-real-uno)'], inferences: ['Probable interés en marketplaces'], posts: [], activity_checked: false, draft_message: 'Hola Ana, vi tu trabajo en Uno Retail. ¿Conectamos?' },
  { full_name: 'Bruno Real Dos', title: 'CEO', company: 'Dos Shop', linkedin_url: 'https://linkedin.com/in/bruno-real-dos', why_fit: 'Fundador', draft_message: 'Hola Bruno, me gustaría conectar.' },
  { full_name: 'Carla Real Tres', title: 'CMO', company: 'Tres Store', linkedin_url: 'https://www.linkedin.com/in/carla-real-tres', why_fit: 'Marketing', draft_message: 'Hola Carla, me gustaría conectar.' },
];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pc-mcp-'));
  const state = buildDesktopInitialState();
  const campaign = newCampaign(state.workspaces[0]!.id, { name: 'E-commerce España', targetCount: 3, searchCriteria: 'e-commerce, España' });
  const task = newResearchTask(campaign.id, 'Buscá 3 responsables de e-commerce en España', []);
  state.campaigns = [campaign];
  state.researchTasks = [task];
  storeFile.writeState(dir, JSON.stringify(state));
  campaignId = campaign.id;
  taskId = task.id;
  inbox = [];
  desktopRunning = true;
  publish();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('hosted MCP endpoint (ChatGPT side)', () => {
  it('rejects unauthenticated calls with a discoverable OAuth challenge', async () => {
    const r = await rpc('tools/list', undefined, 'bad');
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toContain(
      `resource_metadata="${SUPABASE_URL}/functions/v1/crm-mcp/.well-known/oauth-protected-resource"`,
    );
    const meta = await (await handle(new Request(`${SUPABASE_URL}/crm-mcp/.well-known/oauth-protected-resource`), deps)).json();
    expect(meta.authorization_servers).toEqual([`${SUPABASE_URL}/auth/v1`]);
    expect(meta.resource).toBe(MCP);
  });

  it('initialize + tools/list expose the 8 scoped tools', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'chatgpt', version: '1' } });
    expect(init.body.result.protocolVersion).toBe('2025-06-18');
    const note = await handle(
      new Request(MCP, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }),
      deps,
    );
    expect(note.status).toBe(202);
    const list = await rpc('tools/list');
    expect(list.body.result.tools.map((t: { name: string }) => t.name)).toHaveLength(8);
  });

  it('full campaign circuit: criteria → contacts → 3 candidates saved as fichas in the app', async () => {
    const task = await callTool('get_research_task', { task_id: taskId.slice(0, 8) });
    expect(task.data.data.campaign.name).toBe('E-commerce España');
    expect(task.data.data.sender.name).toBeTruthy();
    const contacted = await callTool('list_contacted_people', {});
    expect(contacted.data.data).toEqual([]);

    const saved = await callTool('save_proposals', { task_id: taskId, candidates: CANDIDATES });
    expect(saved.isError).toBe(false);
    expect(saved.data.status).toBe('applied');
    expect(saved.data.created).toHaveLength(3);

    // The fichas are real CRM records in the desktop state file, pending review.
    const state = JSON.parse(storeFile.readStateSync(dir));
    const fichas = state.prospects.filter((p: { campaignId: string }) => p.campaignId === campaignId);
    expect(fichas).toHaveLength(3);
    expect(fichas.every((p: { approval: { status: string } }) => p.approval.status === 'pending')).toBe(true);
    expect(fichas[0].research.verifiedFacts[0]).toContain('Head of E-commerce');
    expect(state.researchTasks[0].status).toBe('proposals_received');

    // ChatGPT now sees them as contacted (snapshot republished) and dedupe holds.
    const after = await callTool('list_contacted_people', { campaign_id: campaignId });
    expect(after.data.data).toHaveLength(3);
    const again = await callTool('save_proposals', { task_id: taskId, candidates: [CANDIDATES[0]] });
    expect(again.data.skipped_hard_duplicates).toEqual(['Ana Real Uno']);
  });

  it('when the app is closed the write is queued, then applied once on next open', async () => {
    desktopRunning = false;
    const saved = await callTool('save_proposals', { task_id: taskId, candidates: [CANDIDATES[1]] });
    expect(saved.data.status).toBe('queued');
    expect(JSON.parse(storeFile.readStateSync(dir)).prospects).toHaveLength(0);
    desktopRunning = true;
    desktopTick();
    desktopTick(); // a second poll must not re-apply
    expect(JSON.parse(storeFile.readStateSync(dir)).prospects).toHaveLength(1);
    expect(inbox[0]!.status).toBe('applied');
  });

  it('invalid writes never reach the inbox', async () => {
    const bad = await callTool('save_proposals', { task_id: taskId, candidates: [{ full_name: 'x' }] });
    expect(bad.isError).toBe(true);
    expect(inbox).toHaveLength(0);
  });
});
