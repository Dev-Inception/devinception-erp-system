# Development Roadmap

Phased plan to take the foundation to a production-ready release. Each phase is
independently shippable.

Legend: ✅ done · ◑ backend done, UI still on mock data · 🚧 next · ⬜ not started.

> **Current reality:** the **backend** (Express + Mongoose + MongoDB) implements
> most modules below. The **frontend** is a polished UI running on an in-memory
> **mock API** — it is not yet wired to the backend. There is no realtime/Socket.IO
> layer, no audit log, and multi-document writes are not yet transactional.

## Phase 0 — Foundation ✅

- [x] Monorepo (npm workspaces), env config + validation, separate frontend/backend.
- [x] Mongoose models for all entities; `seed:roles` + `seed:superadmin` scripts.
- [x] Express app bootstrap: `helmet`, CORS, `express-validator`, Swagger at `/api/docs`, central error handler.
- [x] Design system: Tailwind tokens, dark/light, Radix (shadcn-style) primitives, app shell.

## Phase 1 — Auth & RBAC ✅ (backend) / ◑ (UI)

- [x] JWT access/refresh (stateless), **bcrypt** hashing, forgot/reset password.
- [x] `protect` (JWT) + permission-based `requirePermission` guards; permission catalog; `super_admin` `*` wildcard.
- [x] Roles as data: five seeded system roles + custom-role CRUD.
- [ ] Frontend wired to the real auth API (today: mock login; `refresh()` is a no-op — build the 401-retry interceptor).
- [ ] User & Role management UI (table + create/edit) — _API ready_.
- [ ] Refresh-token rotation/revocation; JWT algorithm pinning; audit log.

## Phase 2 — Catalog & Inventory ◑

- [x] Products API (search, low-stock, per-warehouse stock levels + moving-average cost).
- [x] Warehouses API (CRUD, default warehouse).
- [x] Stock adjust endpoint (`POST /products/:id/adjust-stock`) + append-only `StockMovement`.
- [ ] Inventory UI wired to the API (today: mock data).
- [ ] Product create/edit form (React Hook Form + Zod) + image upload.
- [ ] Barcode lookup endpoint + add-by-scan.
- [ ] Remaining stock ops: transfer / damage; categories/brands/units (currently denormalized string fields on `Product`).

## Phase 3 — POS & Sales ◑

- [x] Checkout API: sale → stock-out (atomic per-line `$inc`) → revenue + COGS journal entries; mixed cash/online/credit settlement.
- [x] POS UI: search, cart, payment, change (on mock data).
- [ ] **Wrap checkout in a MongoDB transaction** (requires replica set) + add an idempotency key.
- [ ] Barcode scanner focus-trap; hold/resume carts; returns/refunds; receipt reprint.
- [ ] Print receipt to thermal on completion.

## Phase 4 — Purchasing (GP) ◑

- [x] `POST/GET /purchases` → stock-in movements (moving-average cost) + Dr Inventory / Cr A/P, plus cash/bank payment on amount paid.
- [x] Vendors API (CRUD; `outstanding` derived). Statements served via `/finance/ledgers/vendor/:id`.
- [ ] GP entry UI + Vendors UI wired to the API (today: mock data).
- [ ] Partial receipts, standalone vendor payments (API exists: `/finance/payments/vendor`), GP edit/cancel.

## Phase 5 — Invoicing + Sharing ◑

- [x] Invoice create (issues stock + Dr A/R / Cr Sales), `POST /invoices/:id/pay`, status (`UNPAID/PARTIAL/PAID`).
- [x] Invoice **PDF** via **PDFKit** (`GET /invoices/:id/pdf`, streamed).
- [x] Email send service (Nodemailer / SMTP) — service implemented.
- [ ] Wire a "Send Invoice" endpoint/UI; WhatsApp send (Cloud API / wa.me).
- [ ] A4 invoice template polish; PDF storage/hosting for share links.

## Phase 6 — Partners & Ledgers ◑

- [x] Customers/Vendors CRUD; Bank accounts CRUD; cash book; customer/vendor receipts & payments.
- [x] Party/cash/bank statements with running balances **derived** from the journal.
- [ ] Ledger UIs wired to the API; credit-limit enforcement, aging.

## Phase 7 — Reports ◑

- [x] Reports API: `sales | purchases | stock-valuation | profit-loss`; dashboard KPIs + 30-day trend + top products.
- [ ] Export to Excel/CSV/PDF; report UIs wired to the API; richer dashboard charts.
- [ ] Timezone-correct day/month boundaries (today aggregations bucket in UTC).

## Phase 8 — Settings 🚧

- [ ] Company (logo), invoice, tax, printer-mapping, WhatsApp, SMTP settings — needs a settings collection (none today).
- [ ] Print-template editor.

## Phase 9 — Desktop & Realtime ◑

- [x] Electron shell + silent printing IPC + auto-update wiring (`electron-builder`).
- [ ] Offline mode: local cache/queue, sync on reconnect.
- [ ] Realtime: introduce Socket.IO (not yet present) for live KPI/stock updates; Redis adapter for multi-terminal.
- [ ] Code-sign + notarize (mac) / NSIS (win), release channel.

## Phase 10 — Quality & Ops ⬜

- [ ] Unit/e2e tests (the backend `test` script is currently a stub) — Jest + Supertest, Vitest + Testing Library, Playwright.
- [ ] CI (lint, typecheck, test, build); Dockerfiles.
- [ ] Observability (structured logs, Sentry); backups.
- [ ] Multi-company / multi-branch (`companyId`) scoping.

---

### Suggested next 3 PRs

1. **Wire the frontend to the real backend** — swap the mock `api.ts` for axios, add the auth/refresh interceptor, surface error states.
2. **Make POS/invoice/purchase checkout transactional** (replica set + `session.withTransaction`) and add checkout idempotency.
3. **Backend security quick wins** — query-param sanitization (user-list NoSQL injection/ReDoS), JWT algorithm pinning, request body-size limits.
