# Prospecting Copilot — Future Operating-Cost Model

> **Pricing estimates must be verified before production implementation.**
> Nothing here is a guaranteed bill. Prices below were checked on the dates
> noted; vendors change pricing frequently. FX assumption: **1 USD ≈ €0.92**
> (verify at time of purchase).

---

## Scenario A — Prototype (current)

| Item                     | Provider                            | Cost           |
| ------------------------ | ----------------------------------- | -------------- |
| Frontend hosting         | GitHub Pages (public repo) or local | €0             |
| Repository               | GitHub free personal account        | €0             |
| Data storage             | Browser local storage               | €0             |
| AI / search / enrichment | None (mock data + local templates)  | €0             |
| **Total**                |                                     | **€0 / month** |

## Scenario B — Lean MVP (target: < €100/month)

Assumptions: 20 research runs/month, 100 candidates/run = **2,000 candidates/
month**; ~6,000 avg input + ~1,200 avg output AI tokens per candidate
(covering extraction, classification, scoring, draft); **90% processed with a
low-cost model, 10% escalated**; company research batched and cached (~600
unique companies/month, ~2 searches each + ~0.5 searches/person on average →
~2,200 searches/month); overnight Batch API processing.

### B.1 Anthropic (checked 2026-08-03, platform.claude.com/docs/en/about-claude/pricing)

Unit: per million tokens (MTok), input/output priced separately.

| Model                                    | Input | Output | Batch input | Batch output |
| ---------------------------------------- | ----- | ------ | ----------- | ------------ |
| Claude Haiku 4.5                         | $1    | $5     | $0.50       | $2.50        |
| Claude Sonnet 5 (intro until 2026-08-31) | $2    | $10    | $1          | $5           |
| Claude Sonnet 5 (from 2026-09-01)        | $3    | $15    | $1.50       | $7.50        |
| Claude Opus 5                            | $5    | $25    | $2.50       | $12.50       |

Batch API = 50% discount; prompt-cache reads = 0.1× input price (workspace
context is identical across candidates → cache it).

Monthly AI cost at 2,000 candidates, standard (non-batch) rates:

- Haiku share: 1,800 × (6,000×$1 + 1,200×$5)/1M = 1,800 × $0.012 = **$21.60**
- Sonnet share: 200 × (6,000×$3 + 1,200×$15)/1M = 200 × $0.036 = **$7.20**
  (post-intro pricing used to be conservative)
- Total ≈ **$28.80** standard, ≈ **$14.40** with Batch API → **€13–27**

### B.2 Web search (checked 2026-08-03)

- **Anthropic web search tool: $10 per 1,000 searches** (same pricing page as
  above; unit = one search call regardless of result count). 2,200 searches →
  **$22 ≈ €20**. Recommended for MVP: no second vendor, no extra API key
  management, results flow straight into the research prompt. Web fetch
  (content extraction) is **free** beyond token costs — removes the need for a
  separate extraction vendor.
- Alternatives to re-verify at build time: Brave Search API (~$5/1k queries,
  brave.com/search/api), Tavily (credit-based, tavily.com/pricing),
  SerpAPI (~$75/mo for 5k searches, serpapi.com/pricing). Not checked live;
  listed for comparison only.

### B.3 Database (to verify at build time — vendor sites)

~2,000 prospect rows/month is trivial scale. Managed Postgres free tiers
(Neon free plan, Supabase free plan) cover it: **€0**, with paid tiers ~$19–25
(≈ €17–23) as headroom. Unit: storage GB + compute hours.

### B.4 Hosting (to verify)

- Frontend: GitHub Pages / Cloudflare Pages free tier: **€0**.
- Thin API + scheduled jobs: Fly.io / Railway / Render hobby ≈ **$0–5 (≈ €0–5)**.
  GitHub Actions scheduled workflows (free minutes on public repos, 2,000
  free min/month private) can run the weekday batch jobs for **€0**.

### B.5 Email finding & verification (optional module, to verify)

- Hunter.io Starter ≈ €34/month (500 searches + 1,000 verifications) — unit:
  per successful search / per verification.
- Apollo.io basic ≈ $49/user/month.
- Recommendation: **exclude from the base MVP**; enable per-prospect, on-demand
  only. Budget €0 in base scenario, €34 if enabled.

### B.6 Email delivery (optional, to verify)

Resend / Brevo / Postmark free tiers (~3,000 emails/month) → **€0** at MVP
volume; Postmark paid from ~$15. Unit: emails sent.

### B.7 Monitoring

Sentry developer free tier + provider dashboards → **€0**.

### B.8 Domain (optional)

~€10–15/year ≈ **€1/month**. GitHub Pages default domain is free.

### Scenario B monthly total

| Category                      | Base       | With options |
| ----------------------------- | ---------- | ------------ |
| Anthropic (batch)             | €14        | €14          |
| Search (Anthropic web search) | €20        | €20          |
| Database                      | €0         | €23          |
| Hosting/API/jobs              | €0–5       | €5           |
| Email enrichment              | €0         | €34          |
| Email delivery                | €0         | €0           |
| Monitoring                    | €0         | €0           |
| Domain                        | €0         | €1           |
| Subtotal                      | **€34–39** | **€97**      |
| + 20% contingency             | **€41–47** | **€116** ⚠   |

**Conclusion:** the base lean MVP runs at roughly **€40–50/month including
contingency** — comfortably under €100. Turning on paid database tier **and**
email enrichment simultaneously breaks the budget; enable at most one.

## Scenario C — Expanded production (what pushes past €100)

| Feature                                                                          | Approx. effect                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------- |
| Deep individual research for _every_ candidate (5–10 searches + 30k tokens each) | Search ~€90–180/mo + AI ~€90–250/mo alone         |
| Browser automation infra (hosted headless browsers)                              | ~€50–150/mo (e.g. Browserless-class services)     |
| Full email enrichment for thousands of contacts                                  | Hunter/Apollo growth tiers €100–400/mo            |
| Premium CRM subscriptions (HubSpot/Salesforce sync seats)                        | €50–1,000+/mo                                     |
| Top-tier model (Opus/Fable) for every task                                       | ~10–15× the Haiku-based AI bill                   |
| Multiple users                                                                   | Linear multiplication of runs + seat-priced tools |
| High email volume (10k+/mo, dedicated IP, deliverability tooling)                | €50–150/mo                                        |
| Large-scale retention (years of raw search/page snapshots)                       | Storage + egress growth, plus GDPR burden         |

## Recommended <€100 architecture

1. **Claude Haiku 4.5 via Batch API** for extraction/classification/scoring/
   drafts; **Sonnet 5 escalation capped at 10–15%** of candidates; prompt
   caching for workspace context.
2. **Anthropic web search + free web fetch** as the only research pipe;
   **company-level caching** (research once per company per month, not per
   person).
3. **Neon/Supabase free Postgres**, thin API on a hobby tier, **GitHub Actions
   scheduled workflows** for weekday runs.
4. **No email enrichment by default**; on-demand per prospect if ever needed.
5. GitHub Pages (or Cloudflare Pages) frontend, free monitoring tiers.

### Mandatory guardrails (implemented server-side from day one of paid usage)

- Monthly hard spending limit (provider console caps **and** app-level cap).
- Per-run limits: max candidates (default 100), max searches (default 250),
  max tokens per candidate (default 10k in / 2k out).
- Usage log for every provider call (unit count, unit price, computed cost,
  run id).
- **Automatic run cancellation** when projected month spend exceeds the
  configured threshold (default: 80% of the cap).
- **15–20% monthly contingency margin** in every budget.

### Budget at the three requested volumes (base architecture, batch pricing, incl. 20% contingency)

| Volume        | Candidates/mo | AI   | Search | Infra | Total ≈    |
| ------------- | ------------- | ---- | ------ | ----- | ---------- |
| 20 runs × 20  | 400           | ~€3  | ~€5    | €0–5  | **€10–16** |
| 20 runs × 50  | 1,000         | ~€7  | ~€11   | €0–5  | **€22–28** |
| 20 runs × 100 | 2,000         | ~€14 | ~€20   | €0–5  | **€41–47** |

The interactive **Cost Estimator** page in the prototype implements this model
with adjustable assumptions, reading unit prices from
`src/data/pricing.json` (a local file — no live API calls).
