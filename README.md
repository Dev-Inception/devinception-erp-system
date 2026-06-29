# DevInception ERP & POS

Enterprise-grade ERP + Point-of-Sale for retail & wholesale businesses.
Runs as a **web app** and an **Electron desktop app** (Windows/macOS), with a path to mobile.

> Stripe/Linear/Shopify-Admin quality UI · Inventory · POS · Purchasing · Invoicing · Ledgers · Reporting · Local printing · WhatsApp/Email.

---

## Monorepo layout

```
devinception-ERP-system/
├── backend/      NestJS + Prisma + PostgreSQL REST API + Socket.IO
├── frontend/     React 18 + TS + Vite + Tailwind + shadcn/UI + React Query + Zustand
├── electron/     Desktop shell (silent local printing, auto-update)
├── docs/         Architecture, ER diagram, API, roadmap, integrations
└── package.json  npm workspaces + root scripts
```

Frontend and backend are **fully separate** workspaces (separate `package.json`,
build, and deploy targets) as required.

---

## Quick start

### 1. Prerequisites

- Node.js ≥ 20, npm ≥ 10
- PostgreSQL ≥ 14 running locally

### 2. Install

```bash
npm install                 # installs all workspaces
cp .env.example .env        # then edit DATABASE_URL etc.
cp .env backend/.env        # backend reads its own .env
```

### 3. Database

```bash
npm run db:migrate -w backend   # create schema
npm run db:seed   -w backend    # demo users, products, warehouse
```

### 4. Run

```bash
npm run dev          # API (:4000) + Web (:5173) together
# or individually:
npm run dev:api
npm run dev:web
npm run dev:desktop  # Electron shell (after web is running)
```

API docs (Swagger): http://localhost:4000/docs

### Demo login

| Role        | Email                       | Password       |
| ----------- | --------------------------- | -------------- |
| Super Admin | superadmin@devinception.com | `Password123!` |
| Admin       | admin@devinception.com      | `Password123!` |
| Manager     | manager@devinception.com    | `Password123!` |
| Cashier     | cashier@devinception.com    | `Password123!` |
| Accountant  | accountant@devinception.com | `Password123!` |

---

## What's implemented now

| Area                                                                   | Status                      |
| ---------------------------------------------------------------------- | --------------------------- |
| Monorepo + tooling + env                                               | ✅                          |
| Complete Prisma schema (all 15+ entities)                              | ✅                          |
| Auth: JWT access/refresh, RBAC guards, forgot/reset                    | ✅                          |
| Users management API                                                   | ✅                          |
| Products/Inventory API (+ stock levels, low-stock)                     | ✅                          |
| **POS checkout** (atomic: sale → stock → ledger → OT)                  | ✅                          |
| Dashboard KPIs + charts API                                            | ✅                          |
| Realtime gateway (Socket.IO)                                           | ✅                          |
| Frontend: theme (dark/light), layout, login, dashboard, POS, inventory | ✅                          |
| Electron shell + silent printing IPC + print templates                 | ✅                          |
| GP, Invoices, Ledgers, Reports, Settings UIs                           | 🚧 scaffolded (see roadmap) |
| WhatsApp / Email send                                                  | 🚧 contract defined         |

See **[docs/ROADMAP.md](docs/ROADMAP.md)** for the phased plan to complete every module.

---

## Documentation

- [System Architecture](docs/ARCHITECTURE.md)
- [Database & ER Diagram](docs/DATABASE.md)
- [API Design](docs/API.md)
- [Printing & Integrations](docs/INTEGRATIONS.md)
- [Development Roadmap](docs/ROADMAP.md)
