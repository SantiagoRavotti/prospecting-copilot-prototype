# Prospecting Copilot — User Flows

All flows below are implemented in the prototype unless marked **(future)**.

---

## Flow 1: Daily review session (core loop)

```
Open app → workspace already selected (persisted)
  → Dashboard shows "N prospects ready for review" → click through
  → Today's Prospects (card mode)
      ┌─────────────────────────────────────────────┐
      │ 1. Read person + fit reason + score  (~15s) │
      │ 2. Expand company/career detail if unsure   │
      │ 3. Edit message (or accept draft)           │
      │ 4. [C] Copy message                         │
      │ 5. [O] Open LinkedIn profile (new tab)      │
      │ 6. — manually: Connect → paste → send —     │
      │ 7. Return to app                            │
      │ 8. [S] Mark as sent → auto-advance          │
      │    or [K] Skip / [L] Later / Archive        │
      └─────────────────────────────────────────────┘
  → batch progress bar reaches 100% → session summary
```

Decision points:

- Low confidence card → user may open LinkedIn/website to verify before sending.
- Wrong target entirely → Skip (kept, deprioritized) or Archive (removed from view)
  or Do-not-contact (never resurfaces).

## Flow 2: Generate today's mock prospects

```
Today's Prospects → "Generate today's mock prospects"
  → choose batch size (10 / 20 / 50 / 100)
  → simulated pipeline with visible stages:
      Mock discovery → Duplicate removal → Simulated research
      → Demo scoring → Prototype messages → Summary
  → prospects appear with status ready_for_review
```

Labels make clear no real research occurred ("Mock discovery", "Demo score",
"Prototype-generated message").

## Flow 3: Add a real prospect manually

```
Today's Prospects / People → "Add prospect"
  → form: name*, title*, company*, country, LinkedIn URL, trigger, notes
  → validation (Zod) → prospect created with template-generated draft
  → lands at top of review queue
```

This is how Santiago tests the workflow against real LinkedIn profiles without
scraping: the human supplies the facts, the app supplies structure + draft.

## Flow 4: CSV import

```
People → "Import CSV" → choose file (processed entirely in-browser)
  → column mapping preview → per-row validation
  → errors listed with row numbers (invalid URL, missing name, …)
  → valid rows imported as prospects (duplicates by LinkedIn URL / name+company
    detected and skipped, reported in summary)
```

## Flow 5: Message editing

```
Card → textarea holds current message (draft or edited)
  → type → char counter updates (LinkedIn invite limit 300 highlighted)
  → Save (persists editedMessage + timestamp)
  → Undo last edit (one level) | Reset to original draft (confirm dialog)
  → Copy uses the final (edited if present, else draft) version
```

Stored separately: originalDraft, editedMessage, finalMessage, editedAt, sentAt.

## Flow 6: Follow-ups

```
Mark sent → optional "remind me in N days" quick action
Follow-ups page → tabs: Due today | Overdue | Upcoming |
                        Accepted awaiting message | Replied awaiting response
  → complete / edit / reschedule / create follow-up
Completing a follow-up logs an Activity.
```

## Flow 7: Pipeline management

```
Pipeline (Kanban) → drag card between status columns
  → status change persisted + Activity logged
  → card click opens prospect detail
```

## Flow 8: Workspace switching & configuration

```
Sidebar workspace switcher → Impact Hydrogen ⇄ Santiago Personal
  → all pages now scoped to the selected workspace
Settings → edit sender identity, positioning, targeting rules, tone, language,
           message length, daily target → autosaved to local storage
```

## Flow 9: Cost estimation

```
Cost Estimator → adjust sliders/inputs (runs, candidates, searches, tokens,
                 model mix, database/hosting plan, enrichment, margin)
  → live totals: per category, total, cost per candidate, budget remaining
  → red warning banner when estimate > €100
  → main cost driver highlighted + reduction suggestions
```

## Flow 10: Export / backup

```
People or Pipeline → Export → CSV | XLSX | JSON backup (browser download)
Settings → Export complete backup | Import backup (restores full state)
         | Reset demo data (confirm dialog)
```

## Flow 11 (future): Automated daily research run

```
(MVP) Scheduler fires weekday morning → SearchProvider discovers organizations
  → dedupe vs existing → AIProvider researches/classifies/scores in batches
  → drafts messages → batch lands in "ready for review"
  → user experience identical to Flow 1 from that point on
```

The prototype's Flow 2 simulates exactly this so the review UX can be validated
before any API is connected.

## Keyboard shortcuts (card mode)

| Key | Action            |
| --- | ----------------- |
| C   | Copy message      |
| O   | Open LinkedIn     |
| S   | Mark as sent      |
| K   | Skip              |
| L   | Save for later    |
| →   | Next prospect     |
| ←   | Previous prospect |

Shortcuts are suppressed while focus is inside any input/textarea.
