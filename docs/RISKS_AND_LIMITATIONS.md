# Prospecting Copilot — Risks and Limitations

## 1. Legal / compliance risks

| Risk                                                                                                                                     | Severity | Mitigation                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LinkedIn terms of service.** Scraping, automation or unofficial APIs can lead to account restriction — catastrophic for a salesperson. | High     | Permanent design rule: the app never touches LinkedIn programmatically. Human performs every action (open profile, connect, paste, send). Volumes stay within normal human behaviour.                                                                         |
| **GDPR / data protection.** MVP would store personal data (names, roles, inferred interests) of mostly EU residents.                     | High     | Prototype: fictional data + local-only storage → minimal exposure. MVP: lawful-basis assessment (legitimate interest for B2B outreach, documented), retention limits, delete-on-request, no sensitive categories, EU-hosted database, no data sold or shared. |
| **AI-generated outreach transparency.** Messages drafted by AI but sent as a person.                                                     | Medium   | Human edits and sends every message; drafts are suggestions, not automation. Keep messages factual and verifiable.                                                                                                                                            |

## 2. Product risks

| Risk                                                                                                          | Severity | Mitigation                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hypothesis is wrong** — card review saves no time vs. spreadsheet.                                          | High     | That is exactly what the prototype tests, before any API spend.                                                                                                         |
| **Hallucinated / stale research** produces embarrassing messages (wrong project, wrong company, wrong name).  | High     | Confidence labels on every card; human review mandatory; source references shown; low-confidence prospects visually flagged; MVP grounds all claims in fetched sources. |
| **Review fatigue** at 100/day; quality of judgment drops.                                                     | Medium   | Batch-size choice (10–100), progress bar, prioritized ordering (Hot first), save-for-later. Measure completion rates per batch size.                                    |
| **Message sameness** — templates (or later AI) converge and recipients notice.                                | Medium   | Multiple patterns, per-pattern analytics (acceptance/reply rate by pattern), easy full rewrite.                                                                         |
| **Garbage-in targeting** — bad workspace configuration yields irrelevant candidates; user blames the product. | Medium   | Editable targeting rules, negative keywords, excluded companies; skip/archive feedback loop is visible in analytics.                                                    |

## 3. Technical limitations of the prototype (by design)

- **No real research or AI.** All prospects are fictional demo data, manual
  entries, or CSV imports; messages come from a local template engine and are
  labeled `Prototype-generated message`.
- **Local storage only.** Data lives in one browser profile. Clearing site data
  deletes everything (mitigated by JSON backup export/import). Storage limit
  ~5 MB — fine for thousands of prospects, not for years of history.
- **Single user, no sync.** No auth, no multi-device, no collaboration.
- **Manual outcome tracking.** Accepted/replied/meeting states are entered by
  hand; the app cannot observe LinkedIn.
- **Analytics are illustrative.** Computed from local actions and demo data;
  labeled prototype data; rates hidden below minimum sample sizes.
- **Cost estimator is a model, not a quote.** Local pricing file, dated;
  displays a verify-before-production warning.
- **Clipboard/new-tab behaviors** depend on browser permissions (clipboard API
  requires HTTPS or localhost; pop-up blockers can block "open LinkedIn").
- **Desktop-first.** Responsive basics only; not optimized for phone use.

## 4. Operational risks (future MVP)

| Risk                                                         | Mitigation                                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Cost blowout from runaway runs                               | Hard caps, metering, projected-spend cancellation (see COST_MODEL.md guardrails)                   |
| Vendor lock-in / price changes                               | Provider interfaces (`AIProvider`, `SearchProvider`, …); pricing re-check ritual before each phase |
| Sonnet 5 intro pricing ends 2026-08-31 (+50%)                | Cost model already uses post-intro pricing                                                         |
| Duplicate outreach to the same person across workspaces/time | Dedupe by LinkedIn URL + name+company (already in prototype); global do-not-contact list           |
| Data loss                                                    | Backups; MVP moves to managed Postgres with PITR                                                   |

## 5. Ethical guardrails

- No deception: sender is always a real person, identified truthfully.
- No spam: daily targets are deliberately modest; quality over volume is the
  product's whole thesis.
- Do-not-contact status is permanent and respected by generation/dedup.
- Demo data is fictional; real-person data enters only via the user's own
  manual input or CSV, stays in their browser, never uploaded anywhere.
