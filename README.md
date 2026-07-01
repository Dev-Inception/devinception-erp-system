# DevInception ERP & POS

Enterprise-grade ERP + Point-of-Sale for retail & wholesale businesses.
Runs as a **web app** and an **Electron desktop app** (Windows/macOS), with a path to mobile.

> Inventory · POS · Purchasing · Invoicing · Ledgers · Reporting · Local printing · Email/PDF.

---

## Monorepo layout

```
devinception-erp-system/
├── backend/      Node.js + Express 5 + MongoDB (Mongoose) REST API — JWT auth + RBAC
├── frontend/     React 18 + TS + Vite + Tailwind + Radix (shadcn-style) + React Query + Zustand
├── electron/     Desktop shell (electron-builder + auto-update)
├── docs/         Architecture, ER diagram, API, roadmap, integrations
└── package.json  npm workspaces + root scripts
```

Frontend and backend are **fully separate** workspaces (separate `package.json`,
build, and deploy targets).

---

## Tech stack

### Backend (`backend/`)

- **Runtime:** Node.js ≥ 20, Express 5 (CommonJS JavaScript)
- **Database:** MongoDB via Mongoose
- **Auth:** JWT access/refresh tokens, role-based access control (RBAC), forgot/reset password
- **Security:** `helmet`, `cors`, `cookie-parser`, `express-rate-limit`, `express-validator`
- **Docs & output:** Swagger UI (`swagger-ui-express`), PDF invoices (`pdfkit`), email (`nodemailer`)
- **Runs on:** `http://localhost:5050`, API base path `/api`

### Frontend (`frontend/`)

- **Framework:** React 18 + TypeScript + Vite
- **UI:** Tailwind CSS + Radix UI primitives (shadcn-style components) + `lucide-react` icons
- **Data/state:** TanStack React Query, Zustand, `axios`
- **Routing/forms/charts:** React Router v6, React Hook Form + Zod, Recharts, `sonner` toasts
- **Realtime:** `socket.io-client`
- **Runs on:** `http://localhost:5173`

> ⚠️ **Note:** the frontend currently ships with an **in-memory mock API**
> (`frontend/src/lib/api.ts` + `mock-data.ts`) so the full UI runs standalone on
> dummy data with no backend or network. Wiring the UI to the live Express API is
> in progress — set `VITE_API_URL` (default `http://localhost:5050/api`) and swap
> the mock client for a real axios instance to connect them.

### Desktop (`electron/`)

- Electron 31 shell that loads the built frontend, packaged with `electron-builder`
  and updated via `electron-updater`.

---

## Quick start

### 1. Prerequisites

- Node.js ≥ 20, npm ≥ 10
- MongoDB ≥ 6 running locally (default `mongodb://127.0.0.1:27017/point-of-sale`)

### 2. Install

```bash
npm install                              # installs all workspaces
cp backend/.env.example backend/.env     # then edit MONGO_URI, JWT secrets, SMTP, super admin
```

### 3. Seed roles & the bootstrap super admin

```bash
npm run seed:roles      -w backend       # create system roles + permissions
npm run seed:superadmin -w backend       # create the super admin from SUPER_ADMIN_* env vars
```

Mongoose has no migration step — schemas/indexes are created on first use.

### 4. Run

```bash
npm run dev          # API (:5050) + Web (:5173) together
# or individually:
npm run dev:api      # backend  (nodemon)
npm run dev:web      # frontend (vite)
npm run dev:desktop  # Electron shell (after web is running)
```

- API base: `http://localhost:5050/api`
- Health check: `GET http://localhost:5050/api/health`
- API docs (Swagger): `http://localhost:5050/api/docs` (raw spec: `/api/docs.json`)

### Roles & first login

The system defines five roles (lowest → highest authority):

| Role        | Value         |
| ----------- | ------------- |
| Cashier     | `cashier`     |
| Accountant  | `accountant`  |
| Manager     | `manager`     |
| Admin       | `admin`       |
| Super Admin | `super_admin` |

The `seed:superadmin` script creates the initial account from your `.env`
(`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`, defaults `superadmin@devinception.com`
/ `ChangeMe123!`). Change these before deploying. All other users are created
through the app once you're logged in.

---

## Backend API modules

Mounted under `/api` (see `backend/src/routes/index.js`):

`auth` · `users` · `roles` · `vendors` · `customers` · `warehouses` ·
`products` · `purchases` · `sales` · `invoices` · `finance` · `dashboard` · `reports`

Core Mongoose models: `user`, `role`, `vendor`, `customer`, `warehouse`,
`product`, `stockLevel`, `stockMovement`, `goodsPurchase`, `sale`, `invoice`,
`journalEntry`, `bankAccount`, `counter`.

## Frontend pages

Login plus the app shell (`frontend/src/App.tsx`):
Dashboard · POS · Products · Warehouses · Sales · Purchases · Invoices ·
Customers · Vendors · Ledgers · Reports · Cash · Settings · Permissions.

---

## Environment variables (backend)

See [`backend/.env.example`](backend/.env.example). Key values:

| Variable                                                            | Purpose                                 |
| ------------------------------------------------------------------- | --------------------------------------- |
| `PORT`                                                              | API port (default `5050`)               |
| `CLIENT_URL`                                                        | Allowed CORS origin for the frontend    |
| `MONGO_URI`                                                         | MongoDB connection string               |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`                          | JWT signing secrets                     |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN`                  | Token lifetimes                         |
| `RESET_TOKEN_EXPIRES_MIN`                                           | Password-reset token lifetime (minutes) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | Email (nodemailer)                      |
| `SUPER_ADMIN_NAME` / `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`   | Bootstrap super admin                   |

The frontend reads `VITE_API_URL` (default `http://localhost:5050/api`) from
`frontend/.env`.

---

## Documentation

- [System Architecture](docs/ARCHITECTURE.md)
- [Database & ER Diagram](docs/DATABASE.md)
- [API Design](docs/API.md)
- [Printing & Integrations](docs/INTEGRATIONS.md)
- [Development Roadmap](docs/ROADMAP.md)
  </content>
  </invoke>
