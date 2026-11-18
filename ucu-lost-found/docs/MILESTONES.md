# Milestone evidence index

| Milestone | Marks | Evidence in this repository |
|---|---|---|
| **1. Problem identification & solution design** (days 1–2) | 20 | `docs/DESIGN_BRIEF.md`: user needs, requirements and acceptance criteria, workflows, mobile and desktop wireframes (`docs/diagrams/wireframes-*.png`), ERD, architecture, 14-day plan |
| **2. Development & integration** (days 3–8) | 20 | Running app; `server/` (auth, reports, claims, admin), `client/` (React), `database/`; commit history from schema → auth → reports → claims → UI |
| **3. Testing, evaluation & improvement** (days 9–11) | 20 | `docs/TEST_RESULTS.md` (54 cases, defects D1–D7, limitations), `server/tests/api.test.js` (31 tests), `client/src/validation.test.js`, `tests/e2e/*.py`, `docs/screenshots/` |
| **4. Presentation & defence** (days 12–14) | 20 | Slide deck (Claude Slides link; export to PDF/PPTX for Moodle), demo plan on slide 11, code trace on slide 14, prep notes below |
| **5. Documentation & reflection** (day 14) | 20 | `docs/UCU_Lost_and_Found_Project_Report.docx`, `README.md`, `database/*.sql`, `render.yaml`, `docs/ACKNOWLEDGEMENTS.md` |

---

# Oral defence preparation

## Trace an action end to end: "Submit claim"

1. **UI:** `client/src/pages/ReportDetail.jsx`, `ClaimSection.submit()`. Calls `validateClaim()` from `client/src/validation.js`, then `api.post('/api/reports/:id/claims')` in `client/src/api.js`.
2. **Session:** `server/src/middleware/auth.js`, `loadUser`. Hashes the cookie token and looks up `sessions JOIN users`. `requireAuth` returns 401 if there is no user.
3. **Validation:** `server/src/validation.js`, schema `claim` (20–1500 characters).
4. **Rules:** `server/src/routes/reports.js`, `router.post('/:id/claims')`. Runs a transaction, `SELECT … FOR UPDATE`, then checks: found item, not own item, not returned or approved, no duplicate.
5. **Database:** `INSERT INTO claims` (the `claims` table in `database/schema.sql`). Responds 201 and the UI shows the success message.

Other good traces: **Approve claim** (`server/src/routes/admin.js` `/claims/:id/approve`) and **Search** (`reports.js` `GET /`, which builds the `WHERE` clause from the filters).

## Likely "small change" tasks and where to make them

| Request | Where |
|---|---|
| Add a new category or campus location | `INSERT INTO categories/locations` (and add it to `database/schema.sql` for new installs). The UI loads them from `/api/reports/meta`, so no React change is needed. |
| Change the minimum claim length from 20 to 30 | `server/src/validation.js` (`claim`) **and** `client/src/validation.js` (`validateClaim`), then update test TC-C2 |
| Change the page size from 12 to 9 | `PAGE_SIZE` in `server/src/routes/reports.js` |
| Change the maximum photo size | `maxPhotoBytes` in `server/src/config.js` and the 2 MB check in `client/src/validation.js` |
| Show the report's created date on cards | `client/src/components/ReportCard.jsx` (`createdAt` is already in the API response) |
| Add a "Withdraw claim" button | New route in `server/src/routes/me.js` (only `pending` claims and only the claimant), a button in `ClaimDetail` (`client/src/pages/Mine.jsx`), plus a test |
| Rename a status label | `STATUS` map in `client/src/components/ui.jsx` |
| Change the session length | `SESSION_HOURS` in `.env` |

## Questions to be ready for

- *Why server-side sessions instead of JWT?* Logout must end access; a stateless JWT stays valid until it expires.
- *How do you stop two approvals?* The handler checks state inside a transaction with row locks, and the `approved_lock` generated column has a UNIQUE index. Test TC-W3 shows the database rejects the second approval directly.
- *How are private details kept private?* Public queries use a whitelist of columns; private details are added only when `isOwner || isAdmin`; claims return 404 to non-owners. Tests TC-R2, TC-C4 and TC-C5 check this.
- *Why store photos in MySQL?* Free hosts have temporary disks, so files would vanish on restart. The cost is a larger database, which is fine at campus scale.
- *What does `SameSite=Lax` / `httpOnly` do?* The cookie is not sent on cross-site POSTs, and JavaScript cannot read it.

## Before the presentation

- [ ] Open the deployed URL 1–2 minutes early (the free tier sleeps when idle).
- [ ] Run `npm run db:setup` on the **local backup** for clean demo data, then start it with `npm run build && npm start`.
- [ ] Have three windows ready: finder (phone size), owner (phone size), admin (desktop).
- [ ] Each member rehearses one trace and one small change.
