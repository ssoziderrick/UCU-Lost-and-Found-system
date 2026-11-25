# UCU Campus Lost & Found

A responsive web application for Uganda Christian University students to report lost and found items, search listings, submit **private** ownership claims, and for an administrator to review claims and confirm returns.

| Layer | Technology 

| Frontend | React 19, React Router 7, Vite 
| Backend | Node.js 18+, Express 5 
| Database | MySQL 8 (also tested on MariaDB 10.11) 
| Security | bcrypt password hashing, httpOnly session cookies stored server-side, Helmet, login rate limiting, zod validation 
| Tests | Jest + Supertest (API, 30 tests), Vitest (client validation), Playwright walkthrough (end-to-end) 



## Features

- Accounts: register, log in, log out. Logout deletes the session on the server, so an old cookie stops working.
- Reports: create and edit your own lost or found reports, with title, category, public description, date, campus location, optional photo.
- Private identifying details on found items, visible only to the finder and the administrator.
- **Search and filter** by keyword, category, campus location, date range, lost/found, and open/returned.
- **Claims:** a logged-in student explains privately why a found item is theirs. You cannot claim your own found item, claim twice, or claim a returned item.
- **Admin review:** compare the claim with the finder's private details, then approve (with collection instructions) or reject, giving a reason.
- **Confirmed return:** an item is marked *returned* only after collection is confirmed. Only one approved claim per item is possible, and this is enforced by a database unique index too.
- Works on phones and desktops, with full keyboard navigation, visible focus, labelled forms and clear loading, empty, success and error messages.

---

## Prerequisites

- **Node.js 18 or newer** (`node -v`)
- **MySQL 8** (or MariaDB 10.6+) running locally, or a hosted MySQL database
- Git

## 1. Install

```bash
git clone <your-repo-url> ucu-lost-found
cd ucu-lost-found
npm run install:all        # installs server/ and client/ dependencies
```

## 2. Configure

Create a MySQL user for the app (example, run in the MySQL shell as root):

```sql
CREATE USER 'lf_app'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON ucu_lost_found.* TO 'lf_app'@'localhost';
GRANT ALL PRIVILEGES ON ucu_lost_found_test.* TO 'lf_app'@'localhost';  -- for automated tests
FLUSH PRIVILEGES;
```

Copy the example environment file and fill in your values:

```bash
cp server/.env.example server/.env
```

| Variable | Meaning |
|---|---|
| `PORT` | API port (default 4000) |
| `NODE_ENV` | `development`, `production` or `test` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection |
| `DB_SSL` | `true` for hosted providers that require TLS |
| `SESSION_HOURS` | How long a login lasts (default 8) |

`server/.env` is git-ignored. **Never commit real passwords.**

## 3. Database setup

Either run the setup script (creates the database, tables and fictional sample data):

```bash
npm run db:setup
```

or run the SQL files directly:

```bash
mysql -u lf_app -p < database/schema.sql
mysql -u lf_app -p ucu_lost_found < database/seed.sql
```

> ⚠️ Both reset the database. `schema.sql` drops existing tables first.

The demo account emails are listed in `database/seed.sql`. Their **passwords are not in this repository**. They are submitted privately on Moodle.

## 4. Run

**Development** (two terminals, hot reload):

```bash
npm --prefix server run dev      # API on http://localhost:4000
npm --prefix client run dev      # React on http://localhost:5173 (proxies /api to the API)
```

Open http://localhost:5173.

**Production-style** (one server serves both API and React build):

```bash
npm run build
NODE_ENV=production npm start    # http://localhost:4000
```

## 5. Tests

```bash
npm test                         # API tests (rebuilds ucu_lost_found_test) + client unit tests
```

End-to-end browser walkthrough (needs Python + Playwright, and the app running on port 4000 with fresh seed data):

```bash
pip install playwright && python -m playwright install chromium
E2E_STUDENT_PW=... E2E_ADMIN_PW=... python tests/e2e/walkthrough.py   # saves screenshots to docs/screenshots
```

Manual test cases and results are in [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md).

---

## Deployment (Render + hosted MySQL)

1. Create a MySQL database on a hosted provider (for example Aiven for MySQL free tier, Railway, or TiDB Cloud Serverless) and note the host, port, user, password and database name.
2. Load the schema and sample data into it from your computer:
   ```bash
   mysql -h <host> -P <port> -u <user> -p --ssl-mode=REQUIRED < database/schema.sql
   mysql -h <host> -P <port> -u <user> -p --ssl-mode=REQUIRED ucu_lost_found < database/seed.sql
   ```
   (If the provider gives you a fixed database name such as `defaultdb`, replace `ucu_lost_found` in both SQL files' `CREATE DATABASE`/`USE` lines, or set `DB_NAME` to it and use `npm run db:setup` with that `.env`.)
3. Push this repository to GitHub. On https://render.com choose **New → Blueprint** and select the repo; `render.yaml` defines the service.
4. In the Render dashboard, enter `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` (and `DB_NAME` if different). Deploy.
5. Visit `https://<your-service>.onrender.com/api/health`. It should return `{"ok":true}`.

The build command installs both packages and builds React. Express then serves the React build and the API from the same origin, so session cookies work without CORS. Photos are stored in MySQL, so they survive restarts on hosts with temporary disks.

---

## Project structure

```
ucu-lost-found/
├── client/                 React app (Vite)
│   └── src/
│       ├── pages/          Browse, ReportDetail, ReportForm, Auth, Mine, admin/*
│       ├── components/     Layout, Guards, ReportCard, ui (Alert, Field, badges…)
│       ├── api.js          fetch wrapper
│       └── validation.js   client-side validation (mirrors server rules)
├── server/                 Express API
│   ├── src/
│   │   ├── routes/         auth, reports, me (+claims), admin
│   │   ├── middleware/     auth.js (sessions, requireAuth, requireAdmin)
│   │   ├── validation.js   zod schemas (authoritative validation)
│   │   └── app.js          Express app, error handler, static client
│   ├── scripts/setup-db.js
│   └── tests/api.test.js
├── database/               schema.sql, seed.sql
├── docs/                   design brief, test results, screenshots, report, slides
├── tests/e2e/              Playwright walkthrough
└── render.yaml             deployment blueprint
```

## API summary

| Method & path | Access | Purpose |
|---|---|---|
| `POST /api/auth/register` · `login` · `logout`, `GET /api/auth/me` | public | Accounts and session |
| `GET /api/reports` | public | Search with `q, type, categoryId, locationId, dateFrom, dateTo, status, page` |
| `GET /api/reports/:id` | public (private details only for owner/admin) | Item detail |
| `POST /api/reports`, `PUT /api/reports/:id` | logged in / owner | Create and edit (multipart, optional `photo`) |
| `POST /api/reports/:id/close` | owner | Mark own lost report resolved |
| `POST /api/reports/:id/claims` | student | Submit private claim |
| `GET /api/me/reports`, `GET /api/me/claims`, `GET /api/claims/:id` | owner / claimant / admin | Own records |
| `GET /api/admin/claims`, `GET /api/admin/claims/:id` | admin | Review queue and evidence |
| `POST /api/admin/claims/:id/approve` · `reject` · `revoke` · `confirm-return` | admin | Decisions and return |
| `GET /api/admin/reports`, `POST /api/admin/reports/:id/remove` · `restore` | admin | Moderation |
