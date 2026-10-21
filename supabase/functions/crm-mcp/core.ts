// Hosted MCP endpoint for ChatGPT — runtime-agnostic core.
//
// Runs inside a Supabase Edge Function (index.ts wires Deno + supabase-js) and
// under Vitest (src/lib/crmMcpCore.test.ts injects fakes). No Deno/Node APIs.
//
// Auth: ChatGPT obtains an access token from Supabase Auth's OAuth 2.1 server
// (issuer <SUPABASE_URL>/auth/v1) after the user signs in and approves the
// consent page. Every request is verified here; RLS then scopes each query to
// that user. Unauthenticated calls get 401 + WWW-Authenticate pointing at the
// protected-resource metadata (RFC 9728), which is how ChatGPT discovers auth.
//
// Transport: MCP Streamable HTTP, stateless, JSON responses (no SSE needed).

export interface Snapshot {
  version: number;
  generatedAt: string;
  workspaces: { id: string; name: string; sender: Record<string, unknown> }[];
  campaigns: Record<string, unknown>[];
  researchTasks: Record<string, unknown>[];
  people: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  followUps: Record<string, unknown>[];
}

export interface InboxRow {
  status: 'pending' | 'applied' | 'failed';
  result: unknown;
}

export interface Deps {
  supabaseUrl: string;
  /** Validates the bearer token; returns the user (and OAuth client) or null. */
  verify(token: string): Promise<{ userId: string; clientId?: string } | null>;
  getSnapshot(token: string): Promise<{ snapshot: Snapshot; updatedAt: string } | null>;
  enqueue(token: string, tool: string, args: unknown, clientId?: string): Promise<string>;
  inboxRow(token: string, id: string): Promise<InboxRow | null>;
  /** Authorization-server metadata, proxied for clients that look for it on the resource host. */
  authServerMetadata(): Promise<unknown>;
  sleep(ms: number): Promise<void>;
  /** How long a write waits for the desktop app to apply it before answering "queued". */
  writeWaitMs?: number;
}

const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const str = { type: 'string' } as const;
const strArr = { type: 'array', items: { type: 'string' } } as const;

export const TOOLS = [
  {
    name: 'list_campaigns',
    description:
      'List campaigns with objective, audience, search criteria, language, tone, target count, exclusions and message guidelines.',
    inputSchema: { type: 'object', properties: { workspace_id: str }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_research_task',
    description:
      'Get a research task created in the Prospecting Copilot app: directive, campaign criteria, sender identity and any profile data already collected. Use the task id given in the directive.',
    inputSchema: {
      type: 'object',
      properties: { task_id: str },
      required: ['task_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_pending_research_tasks',
    description: 'Research tasks created in the app that still need candidates or analysis.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_contacted_people',
    description:
      'People already researched or contacted on this LinkedIn account (all campaigns), for dedupe and context: name, company, profile url, pipeline status, approval, campaign, final message.',
    inputSchema: {
      type: 'object',
      properties: { campaign_id: str, status: str, limit: { type: 'number' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_conversations',
    description: 'Messages sent and replies received for a prospect (or all recent), plus follow-ups.',
    inputSchema: {
      type: 'object',
      properties: { prospect_id: str, limit: { type: 'number' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'save_proposals',
    description:
      'Save candidate fichas for a research task so the user can review them in the app. Each candidate: full_name, title, company, linkedin_url, why_fit, verified_facts[] (only what you actually consulted, with source), inferences[], posts[{url,date,title,source}], activity_checked (true ONLY if you actually consulted recent activity), suggested_opener, draft_message. Never invent posts, photos or facts. Same LinkedIn URL as an existing person = skipped; same name+company = saved with a warning.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: str,
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              full_name: str,
              title: str,
              company: str,
              country: str,
              linkedin_url: str,
              why_fit: str,
              verified_facts: strArr,
              inferences: strArr,
              posts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { url: str, date: str, title: str, source: str },
                  required: ['url'],
                },
              },
              activity_checked: { type: 'boolean' },
              suggested_opener: str,
              draft_message: str,
              photo_url: str,
            },
            required: ['full_name', 'title', 'company', 'why_fit', 'draft_message'],
          },
        },
      },
      required: ['task_id', 'candidates'],
      additionalProperties: false,
    },
  },
  {
    name: 'save_draft',
    description:
      'Propose a new draft message for an existing prospect. It is stored as a proposal the user can apply; it never overwrites an edited or approved message.',
    inputSchema: {
      type: 'object',
      properties: { prospect_id: str, draft_message: str, reason: str },
      required: ['prospect_id', 'draft_message'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_prospect_notes',
    description: 'Append research notes to a prospect.',
    inputSchema: {
      type: 'object',
      properties: { prospect_id: str, notes: str },
      required: ['prospect_id', 'notes'],
      additionalProperties: false,
    },
  },
] as const;

const WRITE_TOOLS = new Set(['save_proposals', 'save_draft', 'update_prospect_notes']);

type Args = Record<string, unknown>;

function byIdOrPrefix<T extends Record<string, unknown>>(rows: T[], key: string, id: unknown): T | undefined {
  const s = String(id ?? '');
  if (!s) return undefined;
  return rows.find((r) => r[key] === s) ?? rows.find((r) => String(r[key] ?? '').startsWith(s));
}

/** Read tools over the snapshot published by the desktop app. */
export function runReadTool(name: string, args: Args, snap: Snapshot): unknown {
  switch (name) {
    case 'list_campaigns':
      return snap.campaigns
        .filter((c) => !args.workspace_id || c.workspaceId === args.workspace_id)
        .map((c) => ({ ...c, workspace: snap.workspaces.find((w) => w.id === c.workspaceId)?.name }));
    case 'get_research_task': {
      const task = byIdOrPrefix(snap.researchTasks, 'id', args.task_id);
      if (!task) {
        throw new Error(
          'Research task not found. Ask the user to press "Investigar" in the app, or check the task id.',
        );
      }
      const campaign = snap.campaigns.find((c) => c.id === task.campaignId);
      const ws = campaign && snap.workspaces.find((w) => w.id === campaign.workspaceId);
      return { task, campaign, sender: ws?.sender };
    }
    case 'list_pending_research_tasks':
      return snap.researchTasks.filter((t) =>
        ['pending', 'collecting', 'ready_for_analysis'].includes(String(t.status)),
      );
    case 'list_contacted_people': {
      const limit = Math.min(Number(args.limit) || 100, 300);
      return snap.people
        .filter(
          (p) =>
            (!args.campaign_id || p.campaign_id === args.campaign_id) &&
            (!args.status || p.status === args.status),
        )
        .slice(0, limit);
    }
    case 'get_conversations': {
      const limit = Number(args.limit) || 50;
      return {
        conversations: snap.conversations
          .filter((c) => !args.prospect_id || c.prospectId === args.prospect_id)
          .slice(-limit),
        follow_ups: snap.followUps.filter((f) => !args.prospect_id || f.prospectId === args.prospect_id),
      };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

/** Light structural validation of write arguments before they reach the inbox. */
export function validateWrite(name: string, args: Args): string | null {
  if (name === 'save_proposals') {
    if (typeof args.task_id !== 'string' || !args.task_id) return 'task_id is required';
    if (!Array.isArray(args.candidates) || args.candidates.length === 0) {
      return 'candidates must be a non-empty array';
    }
    if (args.candidates.length > 50) return 'at most 50 candidates per call';
    for (const c of args.candidates as Args[]) {
      for (const k of ['full_name', 'title', 'company', 'why_fit', 'draft_message']) {
        if (typeof c?.[k] !== 'string' || !(c[k] as string).trim()) return `each candidate needs ${k}`;
      }
    }
    return null;
  }
  if (name === 'save_draft') {
    if (typeof args.prospect_id !== 'string' || typeof args.draft_message !== 'string') {
      return 'prospect_id and draft_message are required';
    }
    return null;
  }
  if (name === 'update_prospect_notes') {
    if (typeof args.prospect_id !== 'string' || typeof args.notes !== 'string') {
      return 'prospect_id and notes are required';
    }
    return null;
  }
  return 'not a write tool';
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...headers },
  });
}

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}
function textResult(value: unknown, isError = false) {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

/** Route path relative to the function, e.g. "/mcp" or "/.well-known/oauth-protected-resource". */
export function relativePath(pathname: string): string {
  const i = pathname.indexOf('/crm-mcp');
  const rest = i >= 0 ? pathname.slice(i + '/crm-mcp'.length) : pathname;
  return rest === '' ? '/' : rest;
}

export function functionBase(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/crm-mcp`;
}

export function protectedResourceMetadata(supabaseUrl: string) {
  const base = functionBase(supabaseUrl);
  return {
    resource: `${base}/mcp`,
    authorization_servers: [`${supabaseUrl.replace(/\/+$/, '')}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'Prospecting Copilot CRM',
  };
}

async function handleRpc(
  msg: Args,
  token: string,
  user: { userId: string; clientId?: string },
  deps: Deps,
) {
  const id = msg.id;
  const method = String(msg.method ?? '');
  const params = (msg.params ?? {}) as Args;
  switch (method) {
    case 'initialize': {
      const requested = String(params.protocolVersion ?? '');
      return rpcResult(id, {
        protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'prospecting-copilot-crm', version: '0.2.0' },
        instructions:
          'CRM of the Prospecting Copilot desktop app. Start from get_research_task with the task id the user gives you; check list_contacted_people before proposing anyone; save candidates with save_proposals. Writes are applied by the desktop app and appear there for human review; nothing is ever sent to LinkedIn from these tools.',
      });
    }
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS });
    case 'tools/call': {
      const name = String(params.name ?? '');
      const args = (params.arguments ?? {}) as Args;
      if (!TOOLS.some((t) => t.name === name)) return rpcResult(id, textResult(`Unknown tool ${name}`, true));
      if (WRITE_TOOLS.has(name)) {
        const problem = validateWrite(name, args);
        if (problem) return rpcResult(id, textResult(`Invalid arguments: ${problem}`, true));
        const inboxId = await deps.enqueue(token, name, args, user.clientId);
        const deadline = deps.writeWaitMs ?? 15000;
        for (let waited = 0; waited < deadline; waited += 1000) {
          await deps.sleep(1000);
          const row = await deps.inboxRow(token, inboxId);
          if (row && row.status !== 'pending') {
            return rpcResult(
              id,
              textResult(
                { status: row.status, inbox_id: inboxId, ...((row.result as object) ?? {}) },
                row.status === 'failed',
              ),
            );
          }
        }
        return rpcResult(
          id,
          textResult({
            status: 'queued',
            inbox_id: inboxId,
            note: 'Saved to the relay. The Prospecting Copilot app is not running right now; it will apply this when it opens and the fichas will appear there for review.',
          }),
        );
      }
      const snap = await deps.getSnapshot(token);
      if (!snap) {
        return rpcResult(
          id,
          textResult(
            'No CRM snapshot yet. Ask the user to open the Prospecting Copilot app and connect the cloud account in Settings.',
            true,
          ),
        );
      }
      try {
        return rpcResult(
          id,
          textResult({ snapshot_updated_at: snap.updatedAt, data: runReadTool(name, args, snap.snapshot) }),
        );
      } catch (e) {
        return rpcResult(id, textResult(e instanceof Error ? e.message : String(e), true));
      }
    }
    default:
      if (method.startsWith('notifications/')) return null;
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const path = relativePath(url.pathname);
  const base = functionBase(deps.supabaseUrl);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
        'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
      },
    });
  }

  if (path.includes('/.well-known/oauth-protected-resource')) {
    return jsonResponse(200, protectedResourceMetadata(deps.supabaseUrl));
  }
  if (
    path.includes('/.well-known/oauth-authorization-server') ||
    path.includes('/.well-known/openid-configuration')
  ) {
    return jsonResponse(200, await deps.authServerMetadata());
  }
  if (path === '/health') return jsonResponse(200, { ok: true, tools: TOOLS.length });

  if (path === '/mcp' || path === '/' || path === '/mcp/') {
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    const user = token ? await deps.verify(token) : null;
    if (!user) {
      return jsonResponse(
        401,
        { error: 'unauthorized', error_description: 'Sign in through the OAuth flow to use this connector.' },
        { 'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"` },
      );
    }
    if (req.method === 'GET') {
      return jsonResponse(405, { error: 'SSE stream not offered; use POST' }, { allow: 'POST' });
    }
    if (req.method === 'DELETE') return new Response(null, { status: 204 });
    if (req.method !== 'POST') return jsonResponse(405, { error: 'method not allowed' });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, rpcError(null, -32700, 'Parse error'));
    }
    const messages = Array.isArray(body) ? body : [body];
    const replies = [];
    for (const m of messages) {
      if (!m || typeof m !== 'object') {
        replies.push(rpcError(null, -32600, 'Invalid request'));
        continue;
      }
      const r = await handleRpc(m as Args, token, user, deps);
      if (r) replies.push(r);
    }
    if (replies.length === 0) {
      return new Response(null, { status: 202, headers: { 'access-control-allow-origin': '*' } });
    }
    return jsonResponse(200, Array.isArray(body) ? replies : replies[0]);
  }

  return jsonResponse(404, { error: 'not_found', path });
}
