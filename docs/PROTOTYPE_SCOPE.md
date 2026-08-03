# Prospecting Copilot — Prototype Scope

Hard rule: **no external or paid APIs, no backend, no API keys, no
infrastructure cost.** Everything runs in the browser; state lives in local
storage; deployment is a static site on GitHub Pages.

---

## In scope (prototype)

### Data & state

- TypeScript models: Workspace, Company, Person, Prospect, Activity, FollowUp.
- ≥40 fictional demo prospects across countries, industries, seniority,
  priorities, scores, statuses, confidence levels — all labeled
  `Demo prospect — fictional data`.
- Two demo workspaces (Impact Hydrogen, Santiago Personal), fully configurable.
- Local-storage persistence of every user change (versioned, with backup
  export/import and demo-data reset).

### Core review workflow

- Today's Prospects with **card mode** (primary) and **table mode**.
- Prospect card: person, company, prospecting analysis, editable message.
- Message engine: local template patterns per workspace/tone/language, variable
  substitution, several patterns for variety, labeled
  `Prototype-generated message`.
- Message lifecycle: original draft / edited / final, undo, reset, char count,
  copy, timestamps.
- Actions: sent, skip, save for later, archive, next/previous, keyboard
  shortcuts, batch progress.
- Mock daily generation (10/20/50/100) with simulated stage progress, honestly
  labeled as mock.

### Supporting pages

- Dashboard (prototype-labeled KPIs).
- Companies (profile, related prospects, signals, notes, score, activity).
- People (search + filters, TanStack Table).
- Follow-ups (due/overdue/upcoming/accepted-awaiting/replied-awaiting; CRUD).
- Pipeline (working Kanban, 13 statuses, drag & drop, persisted).
- Analytics (local counts/rates; rates hidden under minimum sample size).
- Settings (workspace config, backup, reset).
- Cost Estimator (interactive, local pricing file, €100 warning).

### Input/output

- Add prospect manually (validated form).
- CSV import (in-browser parse, validation, error report, dedupe).
- Export CSV / XLSX / JSON backup; full backup import.

### Quality

- TypeScript strict; ESLint; Prettier.
- Vitest unit tests (templates, scoring, dedupe, transitions, char count, CSV,
  workspace config, cost estimator).
- Playwright smoke tests covering the 16 required scenarios.
- GitHub Actions workflow for GitHub Pages static deployment.

## Out of scope (prototype) — explicitly excluded

| Excluded                                                       | Why                             | Where it returns |
| -------------------------------------------------------------- | ------------------------------- | ---------------- |
| Anthropic API / any LLM call                                   | validate UX first               | MVP              |
| Web search / content extraction APIs                           | cost, ToS                       | MVP              |
| LinkedIn API, scraping, or automation                          | ToS risk — permanently excluded | never            |
| Email finding/verification/sending                             | cost                            | MVP-optional     |
| Database, backend, serverless functions                        | €0 target                       | MVP              |
| Authentication / user accounts                                 | single local user               | MVP              |
| Real analytics/telemetry                                       | privacy, cost                   | production       |
| Calendar integration                                           | not core to hypothesis          | production       |
| Multi-user collaboration                                       | single-seat validation          | production       |
| Mobile-optimized layouts beyond responsive basics              | desktop-first daily tool        | production       |
| Next.js server functions, Supabase, Firebase, Vercel functions | forbidden by constraints        | n/a              |

Optional **empty adapter interfaces** (`AIProvider`, `SearchProvider`, …) may
exist in code for architectural clarity but must never make network requests.

## Fidelity contract (honesty rules)

- Every fictional record carries an `isDemo` flag and a visible
  `Demo prospect — fictional data` label.
- Generation UI says **Mock discovery / Simulated research / Demo score /
  Prototype message** — never implying live AI or web research.
- Analytics are labeled prototype data.
- Cost estimator displays: `Pricing estimates must be verified before
production implementation.`

## Definition of done

See the 22-point checklist in the assignment; `IMPLEMENTATION_PLAN.md` maps
phases to it. The prototype is done when the full review → send → track loop,
manual add, CSV import, pipeline, follow-ups, analytics, exports, cost
estimator, persistence across refresh, and GitHub Pages deployment all work
with zero paid services.
