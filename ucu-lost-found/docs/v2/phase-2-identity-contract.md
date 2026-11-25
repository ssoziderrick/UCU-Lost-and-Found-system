# Phase 2 — Identity: API contract

Status: implemented in Phase 2. All paths are under `/api`. Every error response is `{ "error": string, "fields"?: { [field]: string } }`.

## Identifiers

| Account | Signs in with | Stored in |
|---|---|---|
| Student | Registration number | `users.registration_number` (unique, normalised: trimmed, upper-case, spaces removed) |
| Administrator | Staff ID | `users.staff_id` (unique, normalised the same way) |

The accepted registration-number pattern is configurable (`REG_NUMBER_PATTERN`, default `^[A-Z0-9][A-Z0-9/-]{3,19}$`) until UCU confirms its exact format.

Students cannot sign up freely. An account can only be **activated** for a registration number that is in the **student registry** (imported by administrators from an authorised export) with status `enrolled`.

## Sessions

Opaque random token in an httpOnly, SameSite=Lax cookie (Secure in production); only its SHA-256 is stored. Student sessions last `SESSION_HOURS` (8), or 30 days with `remember: true`. Admin sessions last 4 hours and cannot be remembered. All of a user's sessions are deleted on password reset, deactivation and admin role change.

## Student authentication

| Method | Path | Body | Success | Failure |
|---|---|---|---|---|
| POST | `/auth/login` | `{ registrationNumber, password, remember? }` | 200 `{ message, user }` + cookie | 400 field errors · 401 `Registration number or password is incorrect.` (same for unknown number and wrong password) · 401 `This account has been deactivated…` (only after a correct password) · 429 after 5 failures for one registration number in 15 min, whether or not it exists |
| POST | `/auth/logout` | — | 200 | — |
| GET | `/auth/me` | — | 200 `{ user \| null }` | — |

`user` = `{ id, fullName, role: 'student'|'admin', registrationNumber?, staffId?, email?, adminRole?: { code, name }, permissions: string[] }`

## Activation (first sign-in)

| Method | Path | Body | Success | Notes |
|---|---|---|---|---|
| POST | `/auth/activate/start` | `{ registrationNumber, fullName }` | 202 generic message | A 6-digit code and one-time link go to the registry's university email only if: number in registry, `enrolled`, name matches (case, spacing and word order ignored), an email is on file, no account yet. The response is identical in every case. Limited to 3 per number per hour and 10 per IP per hour. |
| POST | `/auth/activate/verify` | `{ registrationNumber, code }` or `{ token }` | 200 `{ ticket, fullName, registrationNumber }` | Code valid 15 min, 5 wrong tries then void. 400 `That code is incorrect or has expired…` |
| POST | `/auth/activate/complete` | `{ ticket, password, confirmPassword }` | 201 `{ message, user }` + cookie | Ticket valid 15 min, single use. Creates the account in a transaction. 409 if the number was activated meanwhile. |

No email on file → the student goes to the office; an officer issues a one-time link (`POST /admin/registry/:registrationNumber/activation-link`, valid 24 h).

## Password recovery (students and admins)

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/auth/password/forgot` | `{ registrationNumber }` or `{ staffId }` | 202 generic message. Code + link sent only to an active account with an email. Same limits as activation. |
| POST | `/auth/password/verify` | `{ registrationNumber \| staffId, code }` or `{ token }` | 200 `{ ticket, fullName, purpose }` |
| POST | `/auth/password/reset` | `{ ticket, password, confirmPassword }` | 200. In one transaction: new hash, lockout cleared, token used, other open tokens voided, **all sessions deleted**, audit entry. A "your password was changed" notice is emailed. The user is not signed in. |

`token` links also cover admin invitations (`purpose: 'admin_invite'`) and office-issued student reset links.

Password rule: 10–72 characters, at least one letter and one number, not in the common-password list, not equal to the registration number or staff ID.

## Administrator authentication

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/auth/admin/login` | `{ staffId, password }` | 200 `{ message, user }` + 4-hour cookie. Same generic failures and lockout as students. |

## Permissions

| Code | Super admin | Officer | Viewer |
|---|:-:|:-:|:-:|
| `stats.view` | ✓ | ✓ | ✓ |
| `claims.review` (read claims) | ✓ | ✓ | ✓ |
| `claims.decide` | ✓ | ✓ | |
| `returns.confirm` | ✓ | ✓ | |
| `reports.moderate` | ✓ | ✓ | |
| `students.manage` | ✓ | ✓ | |
| `registry.manage` (import) | ✓ | | |
| `admins.manage` | ✓ | | |
| `audit.view` | ✓ | ✓ | |

Missing permission → 403 `Your administrator role doesn't allow this.` Students on any `/admin` route → 403.

## Administration

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/admin/students?q&status&page` | students.manage | Accounts joined with registry status |
| POST | `/admin/students/:id/deactivate` `{ reason }` | students.manage | Revokes sessions, audited |
| POST | `/admin/students/:id/reactivate` | students.manage | Audited |
| POST | `/admin/students/:id/reset-link` | students.manage | Returns a 24 h one-time link to hand over in person (after checking the student's ID). Audited. |
| GET | `/admin/registry?q&status&activated&page` | students.manage | |
| POST | `/admin/registry/import` multipart `file` (CSV) + `currentPassword`, `?dryRun=true` | registry.manage | Header row required: `registration_number,full_name,university_email,programme,status`. Valid rows are upserted; invalid rows are listed with line numbers and skipped. Max 2 MB / 20,000 rows. Dry run changes nothing. |
| POST | `/admin/registry/:registrationNumber/activation-link` | students.manage | For enrolled, not-yet-activated students; 24 h link. Audited. |
| GET | `/admin/admins` | admins.manage | |
| POST | `/admin/admins` `{ fullName, staffId, email, roleCode, currentPassword }` | admins.manage | Creates the account without a usable password and emails a 48 h set-password link |
| PATCH | `/admin/admins/:id` `{ roleCode }` | admins.manage | Revokes their sessions so the new permissions apply |
| POST | `/admin/admins/:id/deactivate` · `/reactivate` | admins.manage | Can't deactivate yourself or the last active super admin |
| GET | `/admin/roles` | admins.manage | Roles with their permissions |
| GET | `/admin/audit?action&entityType&page` | audit.view | Newest first |

## Email

`MAIL_TRANSPORT=log` (default outside production) writes each message to the console and to `email_outbox`, so development and tests need no mail server. `MAIL_TRANSPORT=smtp` sends via `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`MAIL_FROM` and stores only the recipient, subject and status (never the code). Production refuses to start with the `log` transport.

## Not in this phase

Two-factor sign-in for admins (planned option), SSO with UCU systems (needs university approval), email change by students.
