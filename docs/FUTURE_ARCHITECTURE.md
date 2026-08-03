# Prospecting Copilot — Future Architecture (design only, NOT implemented)

Nothing in this document is implemented in the prototype. The prototype ships
only empty, non-networking adapter interfaces so this architecture can be
plugged in later without a rewrite.

---

## 1. High-level shape (lean MVP)

```
┌────────────────────────────────────────────────────────────────┐
│  Frontend (same React app, static hosting)                    │
│  – swaps StorageProvider: localStorage → API client            │
└──────────────┬─────────────────────────────────────────────────┘
               │ HTTPS + auth
┌──────────────▼─────────────────────────────────────────────────┐
│  Thin API (single small server or serverless-free host)        │
│  – auth, CRUD, run orchestration, usage metering, cost limits  │
└──┬───────┬───────┬───────┬───────┬─────────────────────────────┘
   │       │       │       │       │
   ▼       ▼       ▼       ▼       ▼
 AIProvider SearchProvider EnrichmentProvider EmailProvider CalendarProvider
 (Anthropic) (web search)  (email find/verify) (Gmail/MS)   (Google/MS)
   │
   ▼
 Postgres (managed free/low tier) + object storage for run artifacts
```

Principles: provider interfaces everywhere (vendor-replaceable), batch + cache
aggressively, hard cost caps enforced server-side, human reviews every message
before sending (the LinkedIn step stays manual forever).

## 2. Provider interfaces

Defined in the prototype at `src/lib/providers/` as types + no-op stubs:

```ts
interface AIProvider {
  synthesizeResearch(input: ResearchInput): Promise<ResearchSummary>;
  classifyProspect(input: ClassifyInput): Promise<Classification>;
  scoreProspect(input: ScoreInput): Promise<ScoreResult>;
  draftMessage(input: DraftInput): Promise<MessageDraft>;
}
interface SearchProvider {
  search(q: SearchQuery): Promise<SearchResult[]>;
}
interface ExtractionProvider {
  extract(url: string): Promise<PageContent>;
}
interface EnrichmentProvider {
  findEmail(p: PersonRef): Promise<EmailResult>;
  verifyEmail(e: string): Promise<VerifyResult>;
}
interface EmailProvider {
  createDraft(d: EmailDraft): Promise<DraftRef>;
} // draft-only by default
interface CalendarProvider {
  proposeSlots(r: SlotRequest): Promise<Slot[]>;
}
interface StorageProvider {
  /* CRUD for all entities — localStorage impl today */
}
```

## 3. Component decisions

### Anthropic API (research synthesis, classification, scoring, drafting)

- Default model: **Claude Haiku 4.5** for extraction, classification, first
  drafts, scoring — cheap and fast.
- Escalation: **Claude Sonnet 5** only for the 10–20% of candidates that are
  high-priority or ambiguous (configurable percentage — the same knob exposed
  in the prototype's cost estimator).
- Use the **Batch API** (50% discount) for overnight research runs; prompt
  caching for the shared workspace/positioning context.
- Strict max-token budgets per candidate; structured outputs (JSON) for
  classification/score.

### Web search + extraction

- One SearchProvider behind an interface (Brave/Tavily/SerpAPI-class — chosen
  at MVP time on price, see COST_MODEL.md).
- Company-level research is **cached**: one research object per company,
  refreshed at most monthly, shared by all prospects of that company.
- Per-run search cap enforced by the orchestrator.

### Database & auth

- Managed Postgres (e.g. Neon/Supabase-class free tier at MVP scale:
  ~2,000 prospect rows/month is tiny).
- Simple email-link or OAuth login; single-tenant at first, workspace_id
  scoping already in the data model.

### Email finding & verification (optional module)

- EnrichmentProvider gated per-prospect ("Find email" button), never bulk by
  default. Verification before any send.

### Gmail / Microsoft integration

- Draft-creation only in MVP (human sends). Sending + reply-detection is a
  production feature with additional consent/permission review.

### Calendar

- Production feature: propose slots / booking link integration.

### Scheduled weekday research runs & background jobs

- Cron (GitHub Actions scheduled workflow or the host's scheduler) triggers a
  run: discover → dedupe → research (batched) → score → draft → publish batch.
- Jobs are idempotent, resumable, and record a run manifest (inputs, outputs,
  costs) for audit.

### Usage metering, cost limits, audit

- Every provider call logged: provider, unit count, token counts, unit price,
  computed cost, run id.
- Hard limits: monthly € cap, per-run candidate cap, per-run search cap,
  per-candidate token cap. Orchestrator **cancels the run** when projected
  spend exceeds the configured threshold and flags it for review.
- Audit log: every prospect status change, message edit, send-mark, export —
  extending the prototype's Activity model.

### Human review (non-negotiable design principle)

- No message is ever sent automatically. AI produces drafts; the human edits,
  copies and sends. Review UI = the prototype's card, unchanged.

### LinkedIn-assisted workflow

- Permanent stance: **no LinkedIn API, no scraping, no automation.** The app
  prepares everything; the human performs every LinkedIn action manually.
  Outcomes (accepted/replied) are recorded manually.

## 4. Migration path from prototype

1. Introduce API-backed `StorageProvider`; keep localStorage as offline cache.
2. Add auth + workspace sync.
3. Implement `AIProvider` (Anthropic) for message drafting first — replaces the
   template engine behind the same `draftMessage()` call the UI already uses.
4. Add SearchProvider + run orchestrator → real "Generate today's prospects".
5. Metering + limits from day one of any paid call.

The prototype UI should survive this migration with almost no changes — that is
the point of validating it first.
