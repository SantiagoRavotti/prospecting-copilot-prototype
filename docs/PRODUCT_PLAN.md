# Prospecting Copilot — Product Plan

**Status:** Prototype planning (pre-MVP)
**Owner:** Santiago Ravotti (personal project)
**Date:** 2026-08-03

---

## 1. Product problem

Impact Hydrogen has difficulty generating a consistent flow of relevant sales
conversations and new contracts. Prospecting today is fragmented: finding
organizations, finding the right people, researching them, deciding whether they
are worth contacting, and writing a personalized message all happen in different
tools (LinkedIn, Google, spreadsheets, notes). The result is low volume, uneven
message quality, and no systematic follow-up.

**Prospecting Copilot** concentrates research, prioritization, and message
editing into a single daily review interface, so a salesperson can contact more
relevant people with better messages in less time.

The product must also be reusable by Santiago personally for networking,
consulting, partnerships, and professional opportunities — hence the
multi-workspace design.

## 2. Main hypothesis

> A salesperson will contact more relevant people, with better messages and less
> preparation time, when all research, prioritization and message editing are
> concentrated in one review interface.

The prototype exists to validate this hypothesis **before** spending money on AI,
search, or enrichment APIs. It does so with mock data, a local template engine,
and a manually-assisted LinkedIn workflow.

## 3. Primary user

**Persona A — Agustín (Impact Hydrogen business developer).**
Sells ecosystem-development services (Hydrogen Valleys, regional hubs,
stakeholder coordination, off-taker identification, training). Sales cycle is
long and relationship-driven; the unit of progress is a _relevant conversation_,
not a closed deal. Needs 10–30 high-quality outreaches per day, in English,
professional and non-aggressive tone. Comfortable with LinkedIn, not a power
user of CRMs.

**Persona B — Santiago (personal networking).**
Uses the same workflow for consulting leads, data/AI projects, partnerships and
relationship building, in English and Spanish. Lower daily volume, higher
variance in targets.

Both personas share one core loop; they differ only in workspace configuration
(sender identity, positioning, targeting rules, language, tone).

## 4. Primary daily workflow

1. Open **Today's Prospects**.
2. Generate or receive a daily batch (10–100 candidates).
3. Review prospects **one at a time** in a large card (not a CRM table).
4. For each prospect, within ~30 seconds: understand who they are, why they were
   selected, and whether the draft message is right.
5. Edit the message if needed, copy it, open LinkedIn, manually send the
   connection request, return, mark as **Sent**, move to the next card.
6. Skip / save-for-later / archive the rest.
7. Check **Follow-ups** for accepted connections and due follow-ups.
8. Move relationships through the **Pipeline** toward meetings and opportunities.

## 5. Information hierarchy

### Essential before contacting someone (must be visible ≤30 seconds)

- Full name, title, company, country.
- Why this person was selected (fit reason) and why now (timing/trigger).
- Lead score and priority (Hot / Strong fit / Networking / Low confidence).
- The draft message, ready to edit.
- LinkedIn URL (one click away).
- Research confidence (so the user knows how much to trust the card).

### Useful but not essential (progressive disclosure)

- Full professional summary and career history.
- Company description, size, type, website, initiatives.
- Score breakdown.
- Source references.
- Recommended service and outreach angle detail.
- Notes and activity history.

The card layout puts essentials above the fold; the rest is available in
expandable sections.

## 6. Prospect card actions

From the card the user can: edit / save / undo / reset the message, copy the
message, open the LinkedIn profile, mark as sent, skip, save for later, archive,
add a note, create a follow-up, and move to next/previous prospect — all with
keyboard shortcuts (C, O, S, K, L, ←, →).

## 7. After contact

Marking **Sent** records the final message and timestamp, moves the prospect to
`connection_sent`, schedules an optional follow-up reminder, and auto-advances
to the next card. Later outcomes (accepted, replied, meeting, opportunity, not
interested) are recorded manually in Pipeline or Follow-ups — the prototype never
reads LinkedIn state.

## 8. Pipeline

A Kanban with statuses:
`new → ready_for_review → (saved_for_later) → connection_sent →
connection_accepted → replied → follow_up_required → meeting_proposed →
meeting_booked → opportunity`, plus terminal states `not_interested`,
`do_not_contact`, `archived`. Any manual transition is allowed (drag & drop),
but every change is logged as an Activity for analytics.

## 9. Workspaces

Multiple isolated prospecting contexts. Each workspace owns its sender identity,
positioning, targeting rules, tone/language defaults, daily target, and its own
prospects, pipeline, follow-ups and analytics. Two demo workspaces ship with the
prototype: **Impact Hydrogen** (Agustín, English, professional) and **Santiago
Personal** (English/Spanish, networking). Switching workspace switches the whole
data view. All configuration persists in local storage.

## 10. Integrations

### Necessary for a future MVP

- **Anthropic API** — research synthesis, classification, scoring, message drafts.
- **Web search provider** — organization and people discovery signals.
- **Web content extraction** — company pages, news, project announcements.
- **Database + auth** — replace local storage (e.g. Postgres + simple auth).
- **Scheduled weekday research runs** — background jobs producing the daily batch.

### Optional

- Email finding/verification (Hunter/Apollo-class) — only if email outreach is added.
- Gmail / Microsoft email integration.
- Calendar integration for meeting booking.
- CRM export/sync.

### Never (by policy)

- LinkedIn scraping or automation. The workflow stays manually assisted.

## 11. What would make it too expensive

- Deep multi-search research on _every_ candidate instead of batched,
  cached, company-level research.
- Using a top-tier model for every task instead of a cheap model + selective
  escalation.
- Full email enrichment on thousands of contacts.
- Browser automation infrastructure.
- Uncapped runs with no per-run/token/search limits.

See `COST_MODEL.md` for the quantified model and the <€100/month architecture.

## 12. What would make it risky or impractical

- LinkedIn terms-of-service violations (mitigated: manual send only).
- GDPR exposure from storing personal data of EU residents (mitigated in
  prototype: fictional data + local-only storage; MVP needs a lawful-basis
  review, retention policy and deletion).
- Hallucinated research producing embarrassing outreach (mitigated: human review
  of every message is a core design principle, plus confidence labels).
- Cost blowout (mitigated: hard caps, metering, cancellation thresholds).
- The hypothesis being wrong: the interface saves no time. That is what the
  prototype tests.

See `RISKS_AND_LIMITATIONS.md`.

## 13. Assumptions to test before building an MVP

1. Card-by-card review is faster and produces better messages than a
   table/spreadsheet workflow.
2. ~30 seconds of context per prospect is enough to make a contact/skip decision.
3. Users actually edit messages (if they never edit, invest in generation; if
   they always rewrite, the template/AI layer is failing).
4. The manual LinkedIn loop (copy → open → paste → send → return → mark sent) is
   acceptable friction.
5. A daily batch of 10–50 is the right unit of work; 100 causes review fatigue.
6. Pipeline + follow-ups are enough structure — a full CRM is not needed.
7. Score/priority labels change user behavior (do users trust and follow them?).
8. The same product works for both company sales and personal networking with
   only workspace-level configuration changes.

The prototype instruments these via local analytics (edit rate, review time
proxies, action counts per pattern/priority).

## 14. Success criteria for the prototype phase

- Santiago and Agustín can each run a real daily session using manually added
  or CSV-imported prospects with their own LinkedIn accounts.
- ≥20 real connection requests sent through the assisted workflow.
- Qualitative confirmation that the card review is faster than the current
  ad-hoc process, and message edit rate is measured.
- A validated cost model showing an MVP can run under €100/month.
