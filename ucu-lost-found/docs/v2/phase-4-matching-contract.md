# Phase 4 — Matching engine and notifications: contract

Rule-based, explainable and deterministic. No AI service.

## Which reports are compared

A **lost** report is compared only with **found** reports, and only when:

1. both are `open`;
2. they were reported by different people (a finder is never told they own what they found);
3. the found date is no more than 1 day before the lost date, and at most `windowDays` (30) after it.

Lost↔lost and found↔found pairs are never compared.

## Score

`score = 0.35·name + 0.25·category + 0.20·location + 0.15·date + 0.05·description` (weights and thresholds live in `app_settings.matching`).

| Factor | Measure |
|---|---|
| name | Titles are normalised (lower case, accents and punctuation removed, plurals singularised, colour words dropped, synonyms mapped: phone/mobile/smartphone, charger/adapter, bottle/flask, bag/backpack, glasses/spectacles, …). Then `0.6 × token containment (over the shorter title) + 0.4 × trigram Dice`. |
| category | Same category 1 · same group 0.5 · either is "Other" 0.3 · else 0 |
| location | Same location 1 · same campus area (zone) 0.5 · either is "Other / Not listed" 0.3 · else 0 |
| date | Days apart ≤ 1 → 1, then falls linearly to 0 at 14 days |
| description | Jaccard overlap of public-description words (stop-words removed). Confidential details are never used. |

**Gate:** if the name score is below 0.25, the pair counts only when the category is exactly the same; otherwise it is discarded. (Without this, "Calculator" and "Calculus textbook" in the same room on the same day would be listed.)

| Score | Result |
|---|---|
| ≥ 0.70 | Stored as `suggested`; the lost report's owner gets one notification (and an email if they allow it) |
| 0.50 – 0.69 | Stored as `suggested` and shown under "Potential matches"; no notification |
| < 0.50 | Not stored; an existing suggestion is set to `expired` |

Each stored match keeps its breakdown and short reasons ("Same category", "Nearby: same area of campus", "Found 2 days after it was lost").

## When matching runs

After a report is created or edited, and after any status change (resolved, approved, approval cancelled, returned, removed, restored). A report that is no longer open has its suggestions set to `expired`. A sweep (`npm run match:sweep`, and every 6 hours in the server) re-scores all open lost reports, so nothing is missed if a request fails half-way. `npm run db:setup` runs the sweep after loading the sample data.

A notification is sent once per pair: `notifications` has a unique key on `(user_id, dedupe_key)`, with `dedupe_key = "match:<lost>:<found>"`. Re-scoring never re-notifies. A dismissed match stays dismissed. When the owner of a matched lost report claims the found item, the match becomes `claimed`.

## Notifications

| Type | To | When |
|---|---|---|
| `match_found` | Owner of the lost report | First time a pair reaches 0.70 |
| `claim_submitted` | Claimant | Claim received |
| `claim_approved` | Claimant | Approved, with collection instructions |
| `claim_rejected` | Claimant | Rejected, with the reason (also when an approval is cancelled or the item went to someone else) |
| `item_returned` | Claimant and finder | Return confirmed |

Emails (when the user has an email and `notify_email` is on) go out for `match_found`, `claim_approved`, `claim_rejected` and `item_returned`.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/me/notifications?unread=1&page` | Newest first, 20 per page |
| GET | `/me/notifications/unread-count` | `{ count }` |
| POST | `/me/notifications/read` | `{ ids: [..] }` or `{ all: true }`; only your own |
| PATCH | `/me/preferences` | `{ notifyByEmail: boolean }` |
| GET | `/me/matches?reportId` | Your suggested matches: your lost report plus the found item's **public** fields, score and reasons |
| POST | `/me/matches/:id/dismiss` | "Not mine": hidden and never re-notified |
| GET | `/admin/matches?status&minScore&page` | `claims.review`. Both reports, score, breakdown |
| GET / PUT | `/admin/settings/matching` | GET `claims.review`, PUT `settings.manage` (super admin). Weights must sum to 1; 0 < list threshold ≤ notify threshold ≤ 1 |
