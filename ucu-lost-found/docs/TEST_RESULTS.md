# Milestone 3 — Test Results

**Environment:** Ubuntu 24.04, Node.js 22, MariaDB 10.11 (MySQL-compatible), Chromium (Playwright), test date 18 Nov 2026.  
**Data:** fictional seed data (`database/seed.sql`). Automated API tests run on a separate database, `ucu_lost_found_test`, that is rebuilt before each run.

| Suite | Command | Result |
|---|---|---|
| API integration tests (Jest + Supertest, real MySQL) | `npm --prefix server test` | **31 / 31 passed** |
| Client validation unit tests (Vitest) | `npm --prefix client test` | **4 / 4 passed** |
| End-to-end browser walkthrough (Playwright, desktop + 375 px phone) | `python tests/e2e/walkthrough.py` | **Passed**, 22 screenshots in `docs/screenshots/` |
| Mobile overflow + keyboard-only checks | `python tests/e2e/a11y_checks.py` | **Passed** (6/6 pages no overflow; keyboard login OK) |

---

## 1. Test cases

"Auto" means the case is an automated test (ID matches the test name in `server/tests/api.test.js`). "Manual/E2E" cases were run in the browser; screenshot evidence is named in brackets.

### 1.1 Accounts and authentication

| ID | Test steps | Expected outcome | Actual outcome | Result |
|---|---|---|---|---|
| TC-A1 (Auto) | Register with empty name, email `not-an-email`, password `short` | 400; field messages: name ≥ 2 chars, "Enter a valid email…", password ≥ 8 chars | 400 with all three field messages | **Pass** |
| TC-A2 (Auto) | Register a valid new student, then read `users.password_hash` | 201; hash starts `$2b$12$`, not the plain password | As expected | **Pass** |
| TC-A3 (Auto) | Register with an email already in use | 409 "An account with this email already exists…" | 409 | **Pass** |
| TC-A4 (Auto) | Log in with a wrong password; log in with an unknown email | Both 401 with the **same** message (no account enumeration) | Identical 401 messages | **Pass** |
| TC-A5 (Auto) | Log in, copy the cookie, log out, replay the old cookie on `/api/me/reports` | 401: logout ends access server-side | 401 | **Pass** |
| TC-A6 (Auto) | Call create report / my claims without logging in | 401 | 401 | **Pass** |
| TC-A7 (Manual) | Submit the login form with a wrong password in the browser | Red alert "Incorrect email or password. Check both and try again." | Shown [02_login_failed] | **Pass** |
| TC-A8 (Manual) | 11 wrong logins in a row from one IP | About the 10th attempt returns 429 "Too many login attempts…" | 9 × 401, then 429 | **Pass** |

### 1.2 Reports, privacy and search

| ID | Test steps | Expected outcome | Actual outcome | Result |
|---|---|---|---|---|
| TC-R1 (Auto) | Create a report with description "short", date 2999-01-01, category "x" | 400 with messages for description, date ("cannot be in the future") and category | As expected | **Pass** |
| TC-R2 (Auto) | Namusoke creates a found item with private details "JK"; fetch the list and detail as the public, Okello, Namusoke and admin | Public list/detail and Okello: no `privateDetails`, no `user_id`; Namusoke and admin: details present | As expected | **Pass** |
| TC-R3 (Auto) | Okello sends `PUT /api/reports/1` (Namusoke's report) | 403; database title unchanged | 403, unchanged | **Pass** |
| TC-R4 (Auto) | Namusoke edits her own open report | 200 | 200 | **Pass** |
| TC-R5 (Auto) | Search `q=keyring&type=found&categoryId=1&locationId=1&dateFrom=…`; then `status=returned` | Every result matches all filters; the returned filter gives only returned/resolved items | As expected | **Pass** |
| TC-R6 (Auto) | Upload a text file renamed `evil.jpg` | 400 "Upload a JPG, PNG or WebP image" (checked by file content, not name) | 400 | **Pass** |
| TC-R7 (Auto) | Upload a valid PNG and fetch `/api/reports/:id/photo` | 201; photo served as `image/png` | As expected | **Pass** |
| TC-R8 (Auto) | Upload a JPEG containing EXIF camera metadata | Stored photo contains no EXIF; image still decodes | EXIF removed | **Pass** |
| TC-R9 (Manual) | Submit an empty report form | Error summary at top listing each problem, focus moves to it, each field outlined red with its message | Shown [03_report_validation] | **Pass** |
| TC-R10 (E2E) | Namusoke publishes "Brown leather wallet" with private details | Success message; owner sees the 🔒 private details box | Shown [05_report_published_owner_view] | **Pass** |
| TC-R11 (E2E) | On a phone, search "wallet", type Found, location Touch of Class | The wallet is listed; the detail page HTML does not contain the private text | Listed; assertion passed [08_search_results_mobile] | **Pass** |
| TC-R12 (Manual) | Search for "zzzz" | Empty state "No items found" with suggestions | Shown | **Pass** |

### 1.3 Claims and permissions

| ID | Test steps | Expected outcome | Actual outcome | Result |
|---|---|---|---|---|
| TC-C1 (Auto) | Namusoke claims her own found item | 403 "You cannot claim an item that you reported as found." | 403 | **Pass** |
| TC-C2 (Auto) | Claim with evidence "mine" | 400, evidence must be ≥ 20 characters | 400 | **Pass** |
| TC-C3 (Auto) | Claim a *lost* report | 400 "Claims can only be made on found items" | 400 | **Pass** |
| TC-C4 (Auto) | Mugisha opens `/api/claims/1` (Atim's claim); Atim opens it | Mugisha 404; Atim 200 with her evidence | As expected | **Pass** |
| TC-C5 (Auto) | Finder (Mugisha) views his found phone's detail | Claim evidence on his item is not exposed | Not present | **Pass** |
| TC-C6 (Auto) | Student calls `GET /api/admin/claims` and `POST …/approve` | 403 | 403 | **Pass** |
| TC-C7 (Auto) | Atim claims the same phone a second time | 409 "already submitted a claim" | 409 | **Pass** |
| TC-C8 (Auto) | Okello claims the charger that has already been returned | 409 "already been returned…" | 409 | **Pass** |
| TC-C9 (E2E) | Okello submits a too-short claim on a phone, then a valid one | Inline error, then "Your claim … Pending review" | [09_claim_validation_mobile], [10_claim_submitted_mobile] | **Pass** |
| TC-C10 (E2E) | A student visits `/admin` | Redirected with "That page is only for the administrator." (the API also refuses) | [22_student_blocked_from_admin] | **Pass** |

### 1.4 Admin review, competing claims and return

| ID | Test steps | Expected outcome | Actual outcome | Result |
|---|---|---|---|---|
| TC-W1 (Auto) | Approve with an empty body | 400 for reason and collection instructions | 400 | **Pass** |
| TC-W2 (Auto) | Two pending claims on the phone: approve claim 1, then try to approve claim 2 | First 200; second 409; exactly one approved claim in the DB | As expected | **Pass** |
| TC-W3 (Auto) | Force `UPDATE claims SET status='approved'` on claim 2 directly in SQL | Database rejects it with `ER_DUP_ENTRY` (unique index) | Rejected | **Pass** |
| TC-W4 (Auto) | New claim while an item is awaiting collection | 409 | 409 | **Pass** |
| TC-W5 (Auto) | Claimant opens My claims after approval | Status *approved* plus collection instructions | As expected | **Pass** |
| TC-W6 (Auto) | Confirm return on a pending (not approved) claim | 409 "only … for an approved claim" | 409 | **Pass** |
| TC-W7 (Auto) | Confirm return on the approved claim | Item *returned*; competing pending claim auto-rejected; any new claim gets 409 | As expected | **Pass** |
| TC-W8 (Auto) | **Full workflow:** found report → search → two claims → reject one → approve other → confirm return | Status *returned*; audit log `reject_claim, approve_claim, confirm_return` | As expected | **Pass** |
| TC-W9 (Auto) | The finder tries to edit the returned report | 409 | 409 | **Pass** |
| TC-W10 (E2E) | Admin opens the wallet claim | Evidence and private details shown side by side | [13_admin_claim_compare] | **Pass** |
| TC-W11 (E2E) | Admin clicks *Record decision* with no reason, then fills it and approves | Error summary, then "Claim approved…" | [14], [15] | **Pass** |
| TC-W12 (E2E) | Claimant checks My claims on a phone | Green "Collect your item: …" | [16_claimant_sees_approval_mobile] | **Pass** |
| TC-W13 (E2E) | Admin confirms collection; the owner reopens the listing | "This item has been returned to its owner…" banner; no claim form | [17], [18_listing_returned_mobile] | **Pass** |
| TC-W14 (E2E) | Admin opens a claim on the phone with competing claims | "Other claims on this item" listed; Approve disabled if another is approved | [19_admin_competing_claims] | **Pass** |

### 1.5 Usability, mobile and accessibility

| ID | Test steps | Expected outcome | Actual outcome | Result |
|---|---|---|---|---|
| TC-U1 | Open Browse, Detail, Report form, My reports, My claims, Register at 375 × 812 | No horizontal scrolling (`scrollWidth ≤ 375`) | All 6 = 375 | **Pass** |
| TC-U2 | Mobile menu | ☰ button toggles the nav; `aria-expanded` updates | [07_mobile_menu_open] | **Pass** |
| TC-U3 | Tables on a phone | Rows display as labelled cards | Verified (My reports, Admin) | **Pass** |
| TC-U4 | Keyboard: press Tab on a fresh page load | First stop is "Skip to main content" | As expected [20_keyboard_skip_link] | **Pass** |
| TC-U5 | Keyboard-only login and search (Tab, type, Enter) | Completes without a mouse | Completed | **Pass** |
| TC-U6 | Focus visibility | 3 px gold outline + navy ring on every focusable element | `outline: solid 3px` measured [21_keyboard_focus_nav] | **Pass** |
| TC-U7 | Admin tabs with arrow keys | ←/→ switch between "Claims to review" and "All reports" | Works | **Pass** |
| TC-U8 | Colour contrast (WCAG 2.1) | Text ≥ 4.5:1; UI borders ≥ 3:1 | See table below | **Pass** |
| TC-U9 | Labels and errors | Every input has a `<label>`; errors linked by `aria-describedby`, `aria-invalid` set, error summary has `role="alert"` | Verified in code and browser | **Pass** |
| TC-U10 | Persistence | Restart the server and reload | Wallet report and photos still present | **Pass** |

**Measured contrast ratios**

| Pair | Ratio |
|---|---|
| Body text #1d2733 on white | 15.1 : 1 |
| Muted text #4a5868 on page #f4f6f9 | 6.7 : 1 |
| White on navy #17365d (header, buttons) | 12.2 : 1 |
| Gold #f2b705 on navy (brand, focus ring) | 6.7 : 1 |
| Error #a11d1d on #fde8e8 | 6.6 : 1 |
| Success #0f6b3a on #e3f4ea | 5.8 : 1 |
| Warning #7a4a00 on #fff1d6 | 6.7 : 1 |
| Input border #6b7b8e on white (non-text) | 4.3 : 1 |

---

## 2. Defects found and corrected

| # | Defect | How found | Fix | Retest |
|---|---|---|---|---|
| D1 | The login rate limiter counted **successful** logins, so a busy lab (shared IP) or a demo would be locked out after 10 normal logins | E2E run started failing at the login step | `skipSuccessfulRequests: true`; only failed attempts count (commit "Fix: login rate limiter…") | TC-A8 and E2E pass |
| D2 | On first page load, focus moved to `<main>`, so the **skip link was not the first Tab stop** | Keyboard test TC-U4 | Move focus to main only on route **changes**, not on first load | TC-U4 pass |
| D3 | `GET /api/auth/me` returned 401 for logged-out visitors, filling the browser console with errors on every page | Console check in E2E | Return `200 {user:null}` when logged out | Console clean except the intentional failed-login test |
| D4 | On phones, the full filter panel pushed results off the first screen | Mobile screenshot review | Category/location/date/status collapsed under "More filters" on small screens | [06_browse_mobile] |
| D5 | Input borders measured ~3.0:1 (borderline for WCAG non-text contrast) | Contrast calculation | Darkened to #6b7b8e (4.3:1) | TC-U8 pass |
| D6 | Phone photos could leak **GPS location** through EXIF metadata in public listings | Privacy review | JPEG APP1 (EXIF/XMP) segments are stripped before saving | TC-R8 pass |
| D7 | Demo passwords were hard-coded in the test file | Repository review against "keep credentials out of Git" | Tests set their own test-only passwords on the test DB; E2E reads passwords from env vars; history cleaned | `git log -p` contains no assessment password |

## 3. Unresolved defects and known limitations

| # | Limitation | Impact | Possible improvement |
|---|---|---|---|
| L1 | No email/SMS notifications (optional in the brief) | Users must check "My claims" | Email on decision (e.g. Nodemailer) |
| L2 | No "forgot password" flow | Admin must reset in the database | Time-limited reset token by email |
| L3 | CSRF protection relies on `SameSite=Lax` cookies and JSON/multipart APIs; no CSRF token | Low risk in modern browsers | Add a double-submit CSRF token |
| L4 | Keyword search uses `LIKE`, with no ranking or typo tolerance | Fine for campus scale; slower with many thousands of rows | MySQL FULLTEXT (index already exists) or a search service |
| L5 | PNG/WebP metadata is not stripped (JPEG only) | Small: phone cameras use JPEG/HEIC | Re-encode all images with `sharp` |
| L6 | HEIC photos from iPhones are not accepted | Users must choose JPEG | Convert on upload |
| L7 | One administrator role; no separate office staff accounts or permissions | Matches the brief | Multiple roles and an office/location field |
| L8 | Free hosting tier sleeps when idle, so the first request after inactivity is slow | Demo delay of ~30–50 s | Open the site a minute before presenting; keep the local version ready |
| L9 | No automatic matching between lost and found reports (optional) | Users search manually | Suggest matches by category + location + date |
