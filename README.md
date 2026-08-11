# Prospecting Copilot — Prototype

An interactive frontend prototype for validating a prospecting workflow:
research, prioritization and LinkedIn-message editing concentrated in one
review interface. Built for **Impact Hydrogen** business development and for
**Santiago Ravotti's** personal networking.

> **Prototype honesty rules**
>
> - No external or paid APIs — no Anthropic, LinkedIn, search, email or
>   database services are connected. No API keys exist anywhere.
> - All demo prospects are **fictional** and labeled as such.
> - Messages are produced by a **local template engine** and labeled
>   `Prototype-generated message` — no AI is involved.
> - All data persists only in your browser's local storage.
> - LinkedIn is never automated: you copy the message, open the profile, and
>   send the connection request manually.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Other commands:

```bash
npm run build      # production build (dist/)
npm run preview    # serve the production build
npm test           # Vitest unit tests
npm run test:e2e   # Playwright smoke tests (requires: npx playwright install chromium)
npm run lint       # ESLint
npm run typecheck  # TypeScript strict
npm run format     # Prettier
```

## The daily workflow the prototype validates

1. Open **Today's Prospects** and generate a mock batch (10/20/50/100) — or add
   a real prospect manually / import a CSV.
2. Review one large prospect card at a time: person, company, why-them,
   why-now, demo score.
3. Edit the message (undo / reset / character count), **Copy**.
4. **Open LinkedIn**, click Connect, paste, send — manually.
5. Back in the app: **Mark as sent** → the next card appears.
6. Track relationships in **Pipeline**, **Follow-ups** and **Analytics**.

Keyboard shortcuts in card mode: `C` copy · `O` open LinkedIn · `S` sent ·
`K` skip · `L` later · `←`/`→` navigate. Shortcuts pause while typing.

## Pages

Dashboard · Today's Prospects (card + table) · Companies · People (search,
filters, CSV import, CSV/XLSX/JSON export) · Follow-ups · Pipeline (kanban) ·
**Tenders & Opportunities** (consulting-opportunity intelligence: explainable
match scoring, saved list, application pipeline, editable sources registry,
alerts, delivery-cost estimate vs. budget, manual "Analyze this opportunity"
entry — see [docs/OPPORTUNITIES_MODULE.md](docs/OPPORTUNITIES_MODULE.md)) ·
Analytics · Cost Estimator (future MVP monthly-cost model with €100 warning) ·
Settings (workspace config, backup import/export, demo reset).

## Documentation

All product planning lives in [`docs/`](docs):

- [PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md) — problem, users, hypothesis, assumptions
- [USER_FLOWS.md](docs/USER_FLOWS.md) — every flow, including keyboard map
- [PROTOTYPE_SCOPE.md](docs/PROTOTYPE_SCOPE.md) — in/out of scope, honesty rules
- [FUTURE_ARCHITECTURE.md](docs/FUTURE_ARCHITECTURE.md) — provider-interface design (not implemented)
- [COST_MODEL.md](docs/COST_MODEL.md) — €0 prototype / <€100 lean MVP / production scenarios
- [RISKS_AND_LIMITATIONS.md](docs/RISKS_AND_LIMITATIONS.md)
- [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — tiers and build phases

## Deployment (GitHub Pages, €0/month)

The repo ships a GitHub Actions workflow ([.github/workflows/deploy.yml](.github/workflows/deploy.yml))
that lints, tests, builds with the correct base path and publishes `dist/` to
GitHub Pages on every push to `main`.

One-time setup in the GitHub repo: **Settings → Pages → Source: GitHub Actions**.

Note: GitHub Pages requires a **public** repository on the free plan. Keep the
repo private and run locally, or make it public to deploy.

## Tech stack

React 18 · Vite 5 · TypeScript (strict) · Tailwind CSS · React Hook Form + Zod ·
TanStack Table · Recharts · SheetJS (XLSX) · Vitest · Playwright · ESLint · Prettier.
State: a small `useSyncExternalStore` store persisted to local storage
(versioned key `prospecting-copilot-state-v1`).

Provider interfaces for the future MVP (`AIProvider`, `SearchProvider`, …) are
defined in [src/lib/providers/index.ts](src/lib/providers/index.ts) as non-networking stubs.
