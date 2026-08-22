// Cross-tenant isolation — the most valuable test in the suite
// (PRODUCTIZATION_PLAN §9.2). Runs against a live Supabase stack (CI spins up
// `supabase start`); skipped when SUPABASE_TEST_URL is not set.
//
// Scenario: users A and B each own a workspace. Authenticated as B, every
// attempt to read or write A's data must fail (0 rows for reads under RLS,
// hard errors for writes). provider_credentials must be unreadable by ANY
// authenticated client (RLS enabled, zero policies).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_KEY;
const enabled = Boolean(url && anonKey && serviceKey);

const d = describe.skipIf(!enabled);

function anonClient(): SupabaseClient {
  return createClient(url!, anonKey!, { auth: { persistSession: false } });
}

let userA: SupabaseClient;
let userB: SupabaseClient;
const WS_A = `ws-a-${Date.now()}`;
const PERSON_A = `pe-a-${Date.now()}`;
const COMPANY_A = `co-a-${Date.now()}`;
const PROSPECT_A = `pr-a-${Date.now()}`;

d('cross-tenant isolation (RLS)', () => {
  beforeAll(async () => {
    const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
    const stamp = Date.now();
    const mkUser = async (name: string) => {
      const email = `${name}-${stamp}@rls-test.local`;
      const password = `Str0ng!${stamp}${name}`;
      const { error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      const client = anonClient();
      const { error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      return client;
    };
    userA = await mkUser('alice');
    userB = await mkUser('bob');

    // A creates a workspace with a company, person and prospect.
    const { data: aUser } = await userA.auth.getUser();
    const { error: wsErr } = await userA
      .from('workspaces')
      .insert({ id: WS_A, owner_id: aUser.user!.id, name: 'Workspace A' });
    if (wsErr) throw wsErr;
    const { error: coErr } = await userA
      .from('companies')
      .insert({ id: COMPANY_A, workspace_id: WS_A, name: 'Company A' });
    if (coErr) throw coErr;
    const { error: peErr } = await userA
      .from('people')
      .insert({ id: PERSON_A, workspace_id: WS_A, full_name: 'Alice Target' });
    if (peErr) throw peErr;
    const { error: prErr } = await userA.from('prospects').insert({
      id: PROSPECT_A,
      workspace_id: WS_A,
      person_id: PERSON_A,
      company_id: COMPANY_A,
      original_draft: 'secret draft belonging to A',
    });
    if (prErr) throw prErr;
  }, 60_000);

  it('sanity: A sees their own data', async () => {
    const { data, error } = await userA.from('prospects').select('*').eq('id', PROSPECT_A);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("B cannot read A's workspace, prospects, people or companies", async () => {
    for (const [table, id] of [
      ['workspaces', WS_A],
      ['companies', COMPANY_A],
      ['people', PERSON_A],
      ['prospects', PROSPECT_A],
    ] as const) {
      const byId = await userB.from(table).select('*').eq('id', id);
      expect(byId.error).toBeNull();
      expect(byId.data, `${table} must be invisible cross-tenant`).toHaveLength(0);
    }
    const byWorkspace = await userB.from('prospects').select('*').eq('workspace_id', WS_A);
    expect(byWorkspace.data).toHaveLength(0);
  });

  it("B cannot write into A's workspace", async () => {
    const insert = await userB.from('prospects').insert({
      id: `pr-intruder-${Date.now()}`,
      workspace_id: WS_A,
      person_id: PERSON_A,
      original_draft: 'intrusion',
    });
    expect(insert.error, 'cross-tenant INSERT must be rejected').not.toBeNull();

    const update = await userB
      .from('prospects')
      .update({ original_draft: 'defaced' })
      .eq('id', PROSPECT_A)
      .select();
    // RLS makes the row invisible: update affects 0 rows.
    expect(update.data ?? []).toHaveLength(0);

    // Verify A's data is untouched.
    const check = await userA.from('prospects').select('original_draft').eq('id', PROSPECT_A);
    expect(check.data?.[0]?.original_draft).toBe('secret draft belonging to A');
  });

  it("B cannot join A's workspace by inserting a membership", async () => {
    const { data: bUser } = await userB.auth.getUser();
    const res = await userB
      .from('workspace_members')
      .insert({ workspace_id: WS_A, user_id: bUser.user!.id, role: 'member' });
    expect(res.error, 'self-invite must be rejected').not.toBeNull();
  });

  it('provider_credentials is unreadable and unwritable for ALL clients', async () => {
    for (const client of [userA, userB]) {
      const read = await client.from('provider_credentials').select('*');
      // Deny-all RLS: reads return zero rows (never data), writes error.
      expect(read.data ?? []).toHaveLength(0);
      const write = await client.from('provider_credentials').insert({
        owner_type: 'account',
        owner_id: 'whoever',
        provider: 'anthropic',
        ciphertext: 'x',
        key_last4: '1234',
      });
      expect(write.error, 'client writes to the vault must be rejected').not.toBeNull();
    }
  });

  it('activities are append-only (no update/delete even in your own workspace)', async () => {
    const actId = `ac-a-${Date.now()}`;
    const ins = await userA.from('activities').insert({
      id: actId,
      workspace_id: WS_A,
      prospect_id: PROSPECT_A,
      type: 'created',
      notes: 'audit entry',
    });
    expect(ins.error).toBeNull();
    const upd = await userA
      .from('activities')
      .update({ notes: 'tampered' })
      .eq('id', actId)
      .select();
    expect(upd.data ?? []).toHaveLength(0);
    const del = await userA.from('activities').delete().eq('id', actId).select();
    expect(del.data ?? []).toHaveLength(0);
    const still = await userA.from('activities').select('notes').eq('id', actId);
    expect(still.data?.[0]?.notes).toBe('audit entry');
  });
});

if (!enabled) {
  describe('cross-tenant isolation (RLS)', () => {
    it.skip('skipped — set SUPABASE_TEST_URL/_ANON_KEY/_SERVICE_KEY to run', () => {});
  });
}
