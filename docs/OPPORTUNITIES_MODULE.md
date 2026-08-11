# Tenders & Opportunities module — plan and scope

Requested by Impact Hydrogen (spec provided 2026-08-06). This document maps the
full vision to what the **prototype** implements now versus what waits for the
MVP/production phases. The prototype rules still apply: **no external APIs, no
scraping, no backend** — everything runs locally with fictional demo data and
manual entry.

## Vision (summary of the request)

A commercial-intelligence tool that finds consulting opportunities (tenders,
RFPs, EOIs, calls for experts, technical assistance…) across EU, UN,
development-cooperation, MDB and government sources in 6+ languages, extracts a
structured executive record, scores fit for Impact Hydrogen with an explainable
0–100 match, tracks applications through a pipeline, evaluates bid/no-bid, and
links each opportunity to a delivery-cost estimate so budget vs. cost vs.
margin is visible in one flow.

## Prototype scope (built now — mirrors the requested MVP §26)

1. New **Opportunities** section in the main navigation, with sub-views:
   **Search**, **Saved**, **Pipeline**, **Sources**, **Alerts**.
2. Opportunity list with card rows: title, organization, country, type, topics,
   budget, deadline, days remaining, match score, status, save/open actions,
   original-source link.
3. Deadline color alerts: red <7 days, orange <15, green otherwise, gray closed;
   "High priority" tag at score ≥80.
4. Keyword search + filters: organization, country, topic, type, status,
   minimum score, deadline window; sorting by match, deadline, published,
   budget.
5. **Manual add via URL** ("Analyze this opportunity"): user pastes a URL and
   whatever fields they know; a **local, simulated analysis** (labeled
   `Prototype analysis — simulated, no live AI`) fills the executive record:
   summary, relevance rationale, applicable services, risks, next steps, score.
   The prototype cannot fetch the URL — extraction fidelity arrives with the
   MVP's real pipeline.
6. Executive record (detail view) with the §13 sections: summary, client info,
   scope, deliverables, eligibility, expert profiles, budget, key dates,
   evaluation criteria, documents, match analysis, risks, next steps, internal
   notes, change history, original link. Missing data displays **"Not
   available"** — never invented.
7. **Explainable match score 0–100** with level bands (80–100 high priority,
   60–79 review, 40–59 possible with partners, 0–39 low) and per-factor
   reasons. Factors: theme match, service match, geography, client type,
   budget fit, deadline runway, eligibility barriers (consortium/local
   partner/experience), strategic value.
8. Save / unsave, assignee, internal notes, per-opportunity change history.
9. Pipeline states (MVP set): New, Review, Go, Partner search, Preparing bid,
   Submitted, Won, Lost, Discarded — Kanban board with drag & drop (reusing the
   existing pipeline pattern).
10. **Delivery-cost estimate linked to each opportunity**: expert days × rates,
    travel, workshops, local costs, subcontractors, contingency → total cost,
    compared against the opportunity budget → **estimated margin**. Saved with
    the opportunity. (This complements the existing operating-cost estimator,
    which models the platform's own future running costs.)
11. Export to XLSX/CSV; opportunities included in the JSON backup.
12. Editable **Sources** registry seeded with the priority list (Clean Hydrogen
    Partnership, TED, F&T Portal, UNIDO, UNGM, UNDP, UNOPS, GIZ, World Bank,
    EBRD, EIB, IDB, AfDB, FIIAPP, Expertise France…). Add/edit/remove without
    touching code. In the prototype, sources are a registry only — nothing is
    crawled.
13. **Alerts (saved searches)**: name + keyword/country/topic/min-score
    criteria, stored locally; each shows its current match count and highlights
    matches in the list. No email — in-app only, labeled prototype.
14. ~24 fictional demo opportunities across the priority organizations,
    countries, topics, budget ranges, deadlines (including <7-day, <15-day and
    closed cases) — all labeled `Demo opportunity — fictional data`.

## Deferred to MVP (needs real backend/APIs — see FUTURE_ARCHITECTURE.md)

- Real discovery: official APIs (TED, UNGM, WB…), RSS, permitted scraping,
  newsletter/email ingestion; multilingual retrieval (EN/ES/FR/PT/DE/IT) and
  cross-language normalization; scheduled daily crawls.
- Real extraction: fetch pages + PDFs (ToR, pliegos, ITT), AI parsing of the
  full §8 field set, AI executive summaries in EN/ES.
- Deduplication across portals with grouped records and change detection
  (deadline extensions, new documents, cancellations, awards).
- Natural-language search ("consultorías de hidrógeno en África…" → filters).
- Email alerts, daily/weekly digests, weekly report generation.
- Bid/no-bid form with recorded decisions; tasks/collaborators; expert-CV
  management; EOI drafting; compliance matrices; competitor history.
- Configurable score weights UI (prototype ships fixed, documented weights).

## Data model additions

`Opportunity` (identification, classification, dates, budget, eligibility,
procedure, analysis, workflow fields, `deliveryEstimate`, `history[]`,
`isDemo`), `OpportunitySource` (name, organization type, url, active),
`OpportunityAlert` (name, criteria, createdAt). App state migrates v1 → v2 by
adding the three collections; existing local data is preserved.

## Honesty rules for this module

- Demo records labeled fictional; simulated analysis labeled simulated.
- "Not available" for unknown fields — the system never invents data.
- Every record keeps its source link and found/last-checked timestamps.
- Human validation principle: scores and drafts assist; a person decides.
