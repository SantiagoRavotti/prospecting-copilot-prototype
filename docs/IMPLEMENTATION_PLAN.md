# Prospecting Copilot — Implementation Plan

## Environment check (Stage 0 record, 2026-08-03)

- Working dir: `C:\Users\sanri\OneDrive\Documentos\Claude Projects` — no
  existing project conflicts.
- Node v20.18.1, npm 10.1.0, git 2.42.0.windows.2 — sufficient.
- Git identity: `Capo <sanrirav@gmail.com>` (personal ✓).
- GitHub CLI: active account **SantiagoRavotti** (personal ✓); a second,
  corporate-looking account `SantiRav2P` is authenticated but **inactive and
  will not be used**. No corporate remotes, repos, or cloud projects touched.
- Caveat: the SantiagoRavotti token lacks the `workflow` scope; pushing
  `.github/workflows/*` may require `gh auth refresh -h github.com -s workflow`
  (documented in Phase 7).
- The home directory is itself a git repo (no remote); the project gets its own
  nested repository, which git handles cleanly.
- Assumption: npm registry access is available (free, not a paid API).

## Priority tiers

### Tier 1 — Prototype requirements (this build)

Everything in `PROTOTYPE_SCOPE.md` § In scope: models, demo data, workspaces,
card/table review, template message engine, message lifecycle, mock generation,
manual add, CSV import, dashboard, companies, people, follow-ups, pipeline,
analytics, settings, cost estimator, exports (CSV/XLSX/JSON), backup
import/export, demo reset, local persistence, tests, GitHub Pages deploy.

### Tier 2 — Future MVP requirements (not built now)

- API-backed StorageProvider + managed Postgres + simple auth.
- Anthropic `AIProvider` (drafting first, then research/classify/score).
- Anthropic web search + web fetch research pipe with company caching.
- Scheduled weekday runs (GitHub Actions cron) with run manifests.
- Usage metering, hard caps, projected-spend auto-cancel, audit log.
- Real analytics on real outcomes.

### Tier 3 — Later production requirements

- Email enrichment/verification (on-demand), Gmail/Microsoft draft creation,
  calendar integration, multi-user + roles, CRM export/sync, retention
  policies + GDPR tooling, monitoring/alerting, custom domain.

### Explicitly excluded (all tiers)

- Any LinkedIn API, scraping, or automation.
- Auto-sending messages of any kind without human action.
- Next.js server functions, Supabase/Firebase in the prototype, Vercel
  serverless, paid analytics, authentication providers in the prototype.

## Build phases (execution sequence)

| Phase | Content                                                                                                                                                                            | Exit criterion                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 0     | Environment inspection                                                                                                                                                             | Recorded above ✓                                          |
| 1     | Planning docs (7)                                                                                                                                                                  | All docs in `docs/` ✓                                     |
| 2     | Foundation: Vite+React+TS strict+Tailwind scaffold, types, seed data (40+ prospects, 2 workspaces), localStorage store with versioning, router + app shell                         | `npm run dev` shows shell with persisted workspace switch |
| 3     | Core review: Today's Prospects card+table, message editor (draft/edited/final, undo/reset/count/copy), actions + shortcuts, mock batch generation with staged progress, manual add | Full review loop works end-to-end                         |
| 4     | Supporting: Dashboard, Companies, People, Follow-ups, Pipeline kanban, Analytics, Settings, CSV import, exports, backup, reset                                                     | All pages functional & persisted                          |
| 5     | Cost estimator with `pricing.json`, warning >€100, driver + suggestions                                                                                                            | Matches COST_MODEL.md numbers                             |
| 6     | QA: prettier, eslint, tsc, vitest unit suites, Playwright 16-scenario smoke, prod build                                                                                            | All green                                                 |
| 7     | Git init, .gitignore, secret check, commits, personal repo creation (verify account = SantiagoRavotti), Pages workflow, instructions                                               | Deployed or exact manual commands provided                |

## Technical decisions

- **Vite + React 18 + TypeScript strict**; **HashRouter** (GitHub Pages-safe,
  no 404 rewrites needed).
- **Tailwind CSS v3.4** + a small custom accessible component kit (buttons,
  cards, badges, dialogs, toasts, tabs, inputs) — shadcn/ui-equivalent, zero
  runtime deps beyond `clsx` + `lucide-react` icons.
- **State:** lightweight custom store (`useSyncExternalStore`) persisting the
  full app state to `localStorage` under a versioned key with migration hook.
- **Forms:** React Hook Form + Zod resolvers. **Tables:** TanStack Table.
  **Charts:** Recharts. **XLSX:** SheetJS (`xlsx`) in-browser writer.
- **CSV:** hand-rolled RFC-4180 parser (small, testable, no dependency).
- **IDs:** `crypto.randomUUID()`.
- **Tests:** Vitest (jsdom only where needed) + Playwright chromium.
- **Deploy:** GitHub Actions → GitHub Pages; `base` set via `vite.config.ts`.

## Risk register for the build itself

- OneDrive-synced folder can slow `node_modules` I/O → acceptable for a
  prototype; document moving the repo out of OneDrive if it becomes painful.
- Token without `workflow` scope may block pushing the Actions workflow →
  fallback commands documented in Phase 7 / README.
- GitHub Pages on a **private** repo requires a paid plan → the repo will be
  created **private** per instructions; deployment instructions cover both
  options (make public later, or use local build).
