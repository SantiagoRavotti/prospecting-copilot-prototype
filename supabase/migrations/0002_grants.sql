-- Explicit role grants. New Supabase projects no longer auto-grant table
-- privileges to API roles for SQL-created tables, so we declare them —
-- which also lets us be deliberately tighter than the old defaults.
--
-- Model: `authenticated` gets CRUD (RLS still gates every row);
-- `anon` gets NOTHING (the app only talks to PostgREST after login);
-- `service_role` keeps full access (server jobs only — never in the frontend).

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Belt and braces on top of RLS:
-- The BYOK vault is not even grant-visible to clients.
revoke all on table public.provider_credentials from authenticated;
-- Metering is server-written, client-read.
revoke insert, update, delete on table public.usage_events from authenticated;
-- Global reference tables are read-only for clients.
revoke insert, update, delete on table public.channel_limits from authenticated;
revoke insert, update, delete on table public.company_research_cache from authenticated;
-- The audit log is append-only at the grant level too.
revoke update, delete on table public.activities from authenticated;

-- Future tables created by migrations get the same baseline.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
