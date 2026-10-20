-- ChatGPT ↔ desktop relay for the hosted MCP endpoint (Edge Function crm-mcp).
--
-- The desktop app stays the CRM's source of truth on the PC. It publishes a
-- read snapshot (campaigns, research tasks, contacted people, conversations);
-- ChatGPT reads it through the MCP tools and its writes (candidates, drafts,
-- notes) land in an inbox that the app applies and acknowledges.
--
-- Every row belongs to one Supabase user. ChatGPT reaches these tables only
-- with an OAuth access token issued by Supabase Auth's OAuth 2.1 server after
-- that user approved the consent page, so RLS (auth.uid()) isolates tenants.

create table if not exists public.crm_snapshots (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  snapshot jsonb not null,
  app_version text,
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool text not null check (tool in ('save_proposals', 'save_draft', 'update_prospect_notes')),
  args jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'failed')),
  result jsonb,
  oauth_client_id text,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists crm_inbox_user_pending_idx
  on public.crm_inbox (user_id, created_at) where status = 'pending';

alter table public.crm_snapshots enable row level security;
alter table public.crm_inbox enable row level security;

drop policy if exists crm_snapshots_own on public.crm_snapshots;
create policy crm_snapshots_own on public.crm_snapshots
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists crm_inbox_select_own on public.crm_inbox;
create policy crm_inbox_select_own on public.crm_inbox
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists crm_inbox_insert_own on public.crm_inbox;
create policy crm_inbox_insert_own on public.crm_inbox
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

drop policy if exists crm_inbox_update_own on public.crm_inbox;
create policy crm_inbox_update_own on public.crm_inbox
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Explicit grants (new projects do not auto-grant). No delete for clients:
-- the inbox doubles as the audit trail of what ChatGPT wrote.
grant select, insert, update on public.crm_snapshots to authenticated;
grant select, insert, update on public.crm_inbox to authenticated;
revoke all on public.crm_snapshots from anon;
revoke all on public.crm_inbox from anon;
