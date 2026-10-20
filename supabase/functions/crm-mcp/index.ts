// Supabase Edge Function entry point: wires Deno + supabase-js into core.ts.
// Deploy: supabase functions deploy crm-mcp --no-verify-jwt --use-api
// --no-verify-jwt because ChatGPT's first, unauthenticated request must get
// OUR 401 + WWW-Authenticate challenge; every request is verified in core.ts.
// No service-role key is used: every query runs as the signed-in user (RLS).

import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { handle, type Snapshot } from './core.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// The project uses the new API keys (legacy anon JWT is disabled), so the
// public publishable key is provided as a function secret.
const ANON_KEY = Deno.env.get('PC_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;

function userClient(token: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function decodeClaims(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part));
  } catch {
    return {};
  }
}

let asMetadataCache: unknown = null;

Deno.serve((req) =>
  handle(req, {
    supabaseUrl: SUPABASE_URL,
    async verify(token) {
      const { data, error } = await userClient(token).auth.getUser(token);
      if (error || !data.user) return null;
      const claims = decodeClaims(token);
      return {
        userId: data.user.id,
        clientId: typeof claims.client_id === 'string' ? claims.client_id : undefined,
      };
    },
    async getSnapshot(token) {
      const { data, error } = await userClient(token)
        .from('crm_snapshots')
        .select('snapshot, updated_at')
        .maybeSingle();
      if (error) throw error;
      return data ? { snapshot: data.snapshot as Snapshot, updatedAt: data.updated_at as string } : null;
    },
    async enqueue(token, tool, args, clientId) {
      const { data, error } = await userClient(token)
        .from('crm_inbox')
        .insert({ tool, args, oauth_client_id: clientId ?? null })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    async inboxRow(token, id) {
      const { data } = await userClient(token)
        .from('crm_inbox')
        .select('status, result')
        .eq('id', id)
        .maybeSingle();
      return data as { status: 'pending' | 'applied' | 'failed'; result: unknown } | null;
    },
    async authServerMetadata() {
      if (asMetadataCache) return asMetadataCache;
      const r = await fetch(`${SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`);
      const body = await r.json();
      if (r.ok) asMetadataCache = body; // never cache an error (e.g. OAuth server still disabled)
      return body;
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  }),
);
