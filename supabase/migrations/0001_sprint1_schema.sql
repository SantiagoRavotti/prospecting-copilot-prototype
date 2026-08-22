-- Sprint 1 schema: full translation of src/lib/types.ts + opportunityTypes.ts
-- (PRODUCTIZATION_PLAN.md §5) plus the new tables from MVP1_CLAUDE_CODE_BRIEF.md §3.
-- Conventions: snake_case, TEXT primary keys (prototype ids survive unchanged),
-- RLS enabled on EVERY table, membership checked via is_workspace_member().

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Function bodies reference tables created later in this migration.
set check_function_bodies = off;

create or replace function public.is_workspace_member(ws_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws_id and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles (auto-created on signup)
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  plan text not null default 'free' check (plan in ('free', 'paid')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select using (user_id = auth.uid());
create policy profiles_update on public.profiles for update using (user_id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- workspaces + membership
-- ---------------------------------------------------------------------------

create table public.workspaces (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  sender_name text not null default '',
  sender_title text not null default '',
  sender_company text not null default '',
  sender_bio text not null default '',
  services text[] not null default '{}',
  value_proposition text not null default '',
  default_language text not null default 'en',
  default_tone text not null default 'professional',
  preferred_message_length text not null default 'medium',
  daily_target integer not null default 10,
  targeting_rules jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id text not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create policy workspaces_select on public.workspaces
  for select using (owner_id = auth.uid() or public.is_workspace_member(id));
create policy workspaces_insert on public.workspaces
  for insert with check (owner_id = auth.uid());
create policy workspaces_update on public.workspaces
  for update using (public.is_workspace_member(id));
create policy workspaces_delete on public.workspaces
  for delete using (owner_id = auth.uid());

create policy members_select on public.workspace_members
  for select using (user_id = auth.uid() or public.is_workspace_member(workspace_id));
create policy members_insert on public.workspace_members
  for insert with check (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())
  );
create policy members_delete on public.workspace_members
  for delete using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())
  );

-- The workspace owner is always a member (kept in sync by trigger).
create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_workspace_created
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace();

-- ---------------------------------------------------------------------------
-- Core prospecting model
-- ---------------------------------------------------------------------------

create table public.companies (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  name text not null,
  website text not null default '',
  domain text not null default '',
  industry text not null default '',
  city text not null default '',
  country text not null default '',
  size text not null default '',
  type text not null default '',
  description text not null default '',
  relevant_initiatives text[] not null default '{}',
  commercial_trigger text not null default '',
  score integer not null default 0,
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.people (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  full_name text not null,
  first_name text not null default '',
  last_name text not null default '',
  title text not null default '',
  company_id text references public.companies (id) on delete set null,
  city text not null default '',
  country text not null default '',
  linkedin_url text not null default '',
  seniority text not null default '',
  functional_area text not null default '',
  professional_summary text not null default '',
  career_summary text not null default '',
  research_confidence text not null default 'medium',
  source_references text[] not null default '{}',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.prospects (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  person_id text not null references public.people (id) on delete cascade,
  company_id text references public.companies (id) on delete set null,
  status text not null default 'new',
  priority text not null default 'networking',
  score integer not null default 0,
  score_breakdown jsonb not null default '{}',
  fit_reason text not null default '',
  timing_reason text not null default '',
  outreach_angle text not null default '',
  recommended_service text not null default '',
  pattern_id text not null default '',
  original_draft text not null default '',
  edited_message text,
  final_message text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  edited_at timestamptz,
  sent_at timestamptz,
  last_activity_at timestamptz,
  outcome text,
  is_demo boolean not null default false
);

-- APPEND-ONLY by policy: select + insert only. This is the GDPR audit log.
create table public.activities (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  prospect_id text not null references public.prospects (id) on delete cascade,
  type text not null,
  previous_status text,
  new_status text,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.follow_ups (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  prospect_id text not null references public.prospects (id) on delete cascade,
  due_at timestamptz not null,
  status text not null default 'pending',
  message text not null default '',
  completed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Opportunities module
-- ---------------------------------------------------------------------------

create table public.opportunities (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  title text not null,
  organization text not null,
  funder text,
  program text,
  reference text,
  url text,
  source_name text not null default '',
  type text not null default 'other',
  contract_type text,
  topics text[] not null default '{}',
  services text[] not null default '{}',
  country text not null default '',
  region text,
  language text,
  published_at timestamptz,
  questions_deadline timestamptz,
  deadline timestamptz,
  start_date timestamptz,
  duration_months integer,
  found_at timestamptz,
  last_checked_at timestamptz,
  budget_min_eur numeric,
  budget_max_eur numeric,
  currency text,
  eligibility jsonb not null default '{}',
  procedure text,
  evaluation_criteria text,
  expert_profiles text[] not null default '{}',
  deliverables text[] not null default '{}',
  documents jsonb not null default '[]',
  summary text not null default '',
  scope_of_work text,
  relevance_rationale text not null default '',
  suggested_services text[] not null default '{}',
  risks text[] not null default '{}',
  next_steps text[] not null default '{}',
  score integer not null default 0,
  match_level text not null default 'low',
  match_factors jsonb not null default '[]',
  status text not null default 'new',
  saved boolean not null default false,
  assignee text,
  notes text not null default '',
  history jsonb not null default '[]',
  delivery_estimate jsonb,
  is_demo boolean not null default false
);

create table public.opportunity_sources (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  name text not null,
  organization_type text not null default '',
  url text not null default '',
  active boolean not null default true,
  is_demo boolean not null default false
);

create table public.opportunity_alerts (
  id text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  name text not null,
  criteria jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- New production tables (brief §3)
-- ---------------------------------------------------------------------------

-- BYOK vault. RLS enabled with NO policies: clients can never read or write it.
-- Sprint 2 adds Edge-Function access (service role) and a key_last4-only view.
create table public.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('account', 'workspace')),
  owner_id text not null,
  provider text not null default 'anthropic',
  ciphertext text not null,
  key_last4 text not null,
  status text not null default 'active' check (status in ('active', 'invalid', 'revoked')),
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  last_used_at timestamptz,
  last_validated_at timestamptz
);
alter table public.provider_credentials enable row level security;
-- (intentionally no policies: deny-all for anon/authenticated)

create table public.workspace_purpose (
  workspace_id text primary key references public.workspaces (id) on delete cascade,
  purpose_text text not null default '',
  target_channel text not null default 'linkedin_invite'
    check (target_channel in ('linkedin_invite', 'linkedin_inmail', 'email')),
  updated_at timestamptz not null default now()
);

create table public.purpose_documents (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  storage_path text not null,
  filename text not null,
  mime text not null default '',
  extracted_text text not null default '',
  uploaded_at timestamptz not null default now()
);

-- Global channel config (editable via settings in Sprint 3; read-only for now).
create table public.channel_limits (
  channel text primary key,
  max_chars integer,
  note text not null default ''
);
insert into public.channel_limits (channel, max_chars, note) values
  ('linkedin_invite', 300, 'LinkedIn connection request note'),
  ('linkedin_inmail', 1900, 'LinkedIn InMail body'),
  ('email', null, 'No hard limit');

create table public.linkedin_imports (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  imported_at timestamptz not null default now(),
  row_count integer not null default 0,
  matched_count integer not null default 0
);

create table public.runs (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  depth text not null default 'normal',
  requested_candidates integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  status text not null default 'pending',
  params jsonb not null default '{}',
  projected_cost_eur numeric,
  actual_cost_eur numeric,
  cancelled_reason text
);

create table public.usage_events (
  id bigint generated always as identity primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  run_id text references public.runs (id) on delete set null,
  provider text not null,
  operation text not null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  search_count integer not null default 0,
  unit_price_snapshot jsonb not null default '{}',
  cost_usd numeric not null default 0,
  cost_eur numeric not null default 0,
  fx_rate numeric not null default 1,
  created_at timestamptz not null default now()
);

create table public.spend_limits (
  workspace_id text primary key references public.workspaces (id) on delete cascade,
  monthly_cap_eur numeric,
  per_run_cap_eur numeric,
  per_run_max_candidates integer not null default 100,
  per_run_max_searches integer not null default 250,
  max_tokens_per_candidate integer not null default 12000,
  auto_cancel_threshold_pct integer not null default 80
);

-- workspace_id NULL = global, permanent entry. Respected by generation/dedupe.
create table public.do_not_contact (
  id text primary key default gen_random_uuid()::text,
  workspace_id text references public.workspaces (id) on delete cascade,
  linkedin_url text not null default '',
  email text not null default '',
  reason text not null default '',
  created_at timestamptz not null default now()
);

-- Global, shared across tenants BY DESIGN (public company info only — see
-- PRODUCTIZATION_PLAN §5). Never store workspace-derived data here.
create table public.company_research_cache (
  domain text primary key,
  summary text not null default '',
  sources jsonb not null default '[]',
  fetched_at timestamptz not null default now(),
  expires_at timestamptz
);

-- ---------------------------------------------------------------------------
-- RLS: tenant isolation on every workspace-scoped table
-- ---------------------------------------------------------------------------

-- Full CRUD for members.
do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'people', 'prospects', 'follow_ups',
    'opportunities', 'opportunity_sources', 'opportunity_alerts',
    'workspace_purpose', 'purpose_documents', 'linkedin_imports',
    'runs', 'spend_limits'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I_select on public.%I for select using (public.is_workspace_member(workspace_id))', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert with check (public.is_workspace_member(workspace_id))', t, t);
    execute format(
      'create policy %I_update on public.%I for update using (public.is_workspace_member(workspace_id))', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete using (public.is_workspace_member(workspace_id))', t, t);
  end loop;
end $$;

-- activities: APPEND-ONLY (no update/delete policies).
alter table public.activities enable row level security;
create policy activities_select on public.activities
  for select using (public.is_workspace_member(workspace_id));
create policy activities_insert on public.activities
  for insert with check (public.is_workspace_member(workspace_id));

-- usage_events: members read; only the server (service role) writes.
alter table public.usage_events enable row level security;
create policy usage_events_select on public.usage_events
  for select using (public.is_workspace_member(workspace_id));

-- do_not_contact: global rows readable by all authenticated; workspace rows by members.
alter table public.do_not_contact enable row level security;
create policy dnc_select on public.do_not_contact
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));
create policy dnc_insert on public.do_not_contact
  for insert with check (workspace_id is not null and public.is_workspace_member(workspace_id));
create policy dnc_delete on public.do_not_contact
  for delete using (workspace_id is not null and public.is_workspace_member(workspace_id));

-- Global read-only reference tables (writes: service role only).
alter table public.channel_limits enable row level security;
create policy channel_limits_select on public.channel_limits
  for select using (auth.role() = 'authenticated');

alter table public.company_research_cache enable row level security;
create policy research_cache_select on public.company_research_cache
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- The four indexes (PRODUCTIZATION_PLAN §5)
-- ---------------------------------------------------------------------------

create index prospects_ws_status_score on public.prospects (workspace_id, status, score desc);
create unique index people_ws_linkedin on public.people (workspace_id, linkedin_url)
  where linkedin_url <> '';
create index usage_events_ws_created on public.usage_events (workspace_id, created_at desc);
create index activities_ws_prospect_created on public.activities (workspace_id, prospect_id, created_at desc);
