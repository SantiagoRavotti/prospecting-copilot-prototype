# Sprint 1 — Auth + DB + Sync (shipped)

Per `MVP1_CLAUDE_CODE_BRIEF.md` §5 Sprint 1. AI/BYOK is Sprint 2 — nothing in
this sprint touches Anthropic or handles API keys beyond the deny-all vault table.

## What shipped

- **Supabase project** `vqyhxjjirskadwomfjkp` (EU / eu-central-1 Frankfurt),
  Postgres 17. Migration `supabase/migrations/0001_sprint1_schema.sql`:
  full model translation (workspaces, workspace_members, companies, people,
  prospects, activities _(append-only)_, follow_ups, opportunities + sources +
  alerts) plus profiles, provider_credentials _(RLS deny-all until Sprint 2)_,
  workspace_purpose, purpose_documents, channel_limits (seeded 300/1900/∞),
  linkedin_imports, runs, usage_events, spend_limits, do_not_contact,
  company_research_cache. RLS on every table via `is_workspace_member()`;
  the four §5 indexes.
- **Dual-mode app.** With `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` at build
  time → cloud mode (AuthGate, magic link, hydration, write-through sync).
  Without them (or `VITE_FORCE_LOCAL=1`) → the original local prototype,
  unchanged; the whole existing test suite runs in that mode.
- **Auth**: magic link (PKCE). The workspace selector now only lists the
  workspaces where the user is in `workspace_members`. Signups are invite-only
  (dashboard setting).
- **Write-through sync** (`src/lib/sync/engine.ts`): hydrate on login, diff on
  every `setState`, FK-ordered upserts, 400 ms debounce, retry queue flag in
  localStorage, `online` re-flush. No component or store rewrite.
- **Backup importer** (`src/lib/backupImport.ts` + AuthGate onboarding +
  Settings): prototype backup JSON → cloud, all ids remapped to fresh UUIDs
  (prototype ids are identical across installs; verbatim import would collide
  across users), FKs remapped consistently, then re-hydration.
- **Ops**: weekly encrypted `pg_dump` (backup.yml, AES-256+PBKDF2, 90-day
  artifacts, restore drill in the header), weekly keep-alive ping
  (keepalive.yml), RLS isolation suite in CI against `supabase start`
  (rls-test.yml).
- **Sentry** (`src/lib/sentry.ts`): DSN-gated; every event/breadcrumb passes
  `redactDeep()` which strips `sk-ant-*` and `sbp_*` patterns.
- **Secret guard in the store**: `persist()` sanitizes — the localStorage state
  can never contain `provider_credentials`/`providerCredentials` keys or any
  `sk-ant-*` string (unit-tested end-to-end).

## Manual login e2e (run once per deploy — takes 2 minutes)

1. Open `https://santiagoravotti.github.io/prospecting-copilot-prototype/`.
2. Enter an invited email → "Send magic link".
3. Open the email on the same device/browser; click the link.
4. Verify: you land on `.../prospecting-copilot-prototype/?code=...`, the app
   shows "Loading your workspaces…", the URL is cleaned to `.../#/`, and the
   dashboard renders. No redirect loop, no HashRouter interference.
5. Refresh → still signed in. Sign out → login screen returns.

## Operator runbook (Santiago)

- **Invite a user**: Supabase Dashboard → Authentication → Users → Invite user.
  Signups must stay disabled (Auth → Providers → Email).
- **Auth URLs** (one-time): Auth → URL Configuration → Site URL =
  `https://santiagoravotti.github.io/prospecting-copilot-prototype/`; Redirect
  URLs += same value and `http://localhost:5173/`.
- **GitHub secrets** (Settings → Secrets → Actions): `SUPABASE_URL`,
  `SUPABASE_ANON_KEY` (build + keepalive), `SUPABASE_DB_URL` +
  `BACKUP_PASSPHRASE` (backups), optional `VITE_SENTRY_DSN`.
  The **service_role key is used nowhere** in Sprint 1 — keep it that way.
- **Restore drill** (do once): download a backup artifact →
  `openssl enc -d -aes-256-cbc -pbkdf2 -in backup-*.sql.enc -out backup.sql -pass pass:"<passphrase>"`
  → restore into a scratch project → confirm row counts.
- **Rotate the CLI access token** used during this sprint (Account → Access
  Tokens) — it was shared in a chat transcript.

## Data notes

- Postgres PKs are TEXT; imported entities get fresh UUIDs (see importer note).
- `activities` has no UPDATE/DELETE policies — the audit log is append-only.
- `company_research_cache` is intentionally global/cross-tenant (public company
  facts only). Documented decision from PRODUCTIZATION_PLAN §5.
- `usage_events` is client-readable, server-writable only (Sprint 2 fills it).
