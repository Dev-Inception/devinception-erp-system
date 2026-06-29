# DevInception ERP & POS

Enterprise-grade ERP + Point-of-Sale for retail & wholesale businesses.
Runs as a **web app** and an **Electron desktop app** (Windows/macOS), with a path to mobile.

> Inventory · POS · Purchasing · Invoicing · Ledgers (double-entry) · Reporting · Local printing · Email · PDF.

---

## Monorepo layout

```
devinception-ERP-system/
├── backend/      Express 5 + Mongoose + MongoDB REST API (JWT auth, RBAC)
├── frontend/     React 18 + TS + Vite + Tailwind + Radix (shadcn-style) + React Query + Zustand
├── electron/     Desktop shell (silent local printing, auto-update via electron-builder)
├── docs/         Architecture, ER diagram, API, roadmap, integrations
└── package.json  npm workspaces + root scripts
```

Frontend and backend are **fully separate** workspaces (separate `package.json`,
build, and deploy targets).

> **Integration status:** the backend exposes real REST APIs, but the frontend
> currently runs on an **in-memory mock API** (`frontend/src/lib/api.ts`) with
> mock authentication — it is not yet wired to the backend. The `axios` and
> `socket.io-client` dependencies are present for that upcoming integration but
> are not used yet. There is no realtime/Socket.IO gateway implemented.

---

## Quick start

### 1. Prerequisites

- Node.js ≥ 20, npm ≥ 10
- MongoDB ≥ 6 running locally (default URI `mongodb://127.0.0.1:27017/point-of-sale`)

### 2. Install

```bash
npm install                                # installs all workspaces
cp backend/.env.example backend/.env       # then edit MONGO_URI, JWT secrets, etc.
```

> Generate strong JWT secrets before running anything real:
> `openssl rand -hex 32` (set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`).
> The defaults in `.env.example` are placeholders and must be replaced.

### 3. Seed roles + super admin

```bash
npm run seed:roles      -w backend   # create the built-in system roles
npm run seed:superadmin -w backend   # create the bootstrap super-admin user
```

Mongoose has no migration step — schemas/indexes are created on first use.

### 4. Run

```bash
npm run dev          # API + Web together
# or individually:
npm run dev:api      # backend (default :5050 — see backend/.env)
npm run dev:web      # frontend (:5173)
npm run dev:desktop  # Electron shell (after web is running)
```

> The backend listens on `PORT` from `backend/.env` (`.env.example` sets `5050`,
> chosen to avoid the macOS AirPlay conflict on `5000`; the in-code fallback is
> `5000`). `CLIENT_URL` (default `http://localhost:3000`) controls the CORS origin —
> set it to `http://localhost:5173` to allow the Vite dev server.

API docs (Swagger): `http://localhost:5050/api/docs`
Raw OpenAPI spec: `http://localhost:5050/api/docs.json`

### Credentials

**Backend** — only a single super-admin user is seeded, from your `backend/.env`:

| Variable               | Default (`.env.example`)      |
| ---------------------- | ----------------------------- |
| `SUPER_ADMIN_EMAIL`    | `superadmin@devinception.com` |
| `SUPER_ADMIN_PASSWORD` | `ChangeMe123!`                |

Additional users (admin, manager, cashier, accountant, …) are created **through
the API** by the super admin; they are not seeded. The five system **roles**
(`cashier`, `accountant`, `manager`, `admin`, `super_admin`) are created by
`seed:roles`.

**Frontend** — the mock login (`frontend/src/store/auth.ts`) accepts **any**
non-empty email/password and infers the role from the email local-part
(e.g. `admin@…` → admin). This is demo-only and will be replaced at backend
integration.

---

## What's implemented now

| Area                                                                | Status                                  |
| ------------------------------------------------------------------- | --------------------------------------- |
| Monorepo + tooling (ESLint, Prettier, Husky) + env validation       | ✅                                      |
| Auth: JWT access/refresh, RBAC guards, forgot/reset password        | ✅                                      |
| Users + Roles/Permissions API                                       | ✅                                      |
| Products / Inventory API (stock levels, movements, low-stock)       | ✅                                      |
| POS checkout (sale → stock → double-entry ledger)                   | ✅ _(not yet transactional — see note)_ |
| Purchasing, Invoices, Finance/Ledgers, Dashboard KPIs, Reports APIs | ✅                                      |
| Email (Nodemailer) + Invoice PDF (PDFKit)                           | ✅                                      |
| Frontend UI: theme, layout, login, dashboard, POS, inventory, etc.  | ✅ _(on mock data — not wired to API)_  |
| Electron shell + silent printing IPC + print templates              | ✅                                      |
| Realtime gateway (Socket.IO)                                        | ❌ not implemented                      |
| WhatsApp / Email send from the UI                                   | 🚧 mock contract defined                |

> **Note on POS atomicity:** the checkout flow currently performs the stock
> decrement and ledger posts as separate writes without a MongoDB transaction,
> so a mid-sequence failure can leave stock and ledger out of sync. Wrapping these
> flows in `session.withTransaction` (requires a MongoDB replica set) is tracked
> on the roadmap.

See **[docs/ROADMAP.md](docs/ROADMAP.md)** for the phased plan to complete every module.

---

## Documentation

- [System Architecture](docs/ARCHITECTURE.md)
- [Database & ER Diagram](docs/DATABASE.md)
- [API Design](docs/API.md)
- [Printing & Integrations](docs/INTEGRATIONS.md)
- [Development Roadmap](docs/ROADMAP.md)

> Some design docs may still describe the originally-planned stack. The
> **implemented** stack is the one documented above (Express + Mongoose + MongoDB).
