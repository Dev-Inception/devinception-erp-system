# Development Roadmap

Phased plan to take the foundation to a production-ready release. Each phase is
independently shippable. ✅ = done in this scaffold · 🚧 = next.

## Phase 0 — Foundation ✅
- [x] Monorepo (npm workspaces), env config, separate frontend/backend.
- [x] Prisma schema for all entities; seed script.
- [x] NestJS bootstrap, global validation, Swagger, CORS.
- [x] Design system: Tailwind tokens, dark/light, shadcn primitives, app shell.

## Phase 1 — Auth & RBAC ✅
- [x] JWT access/refresh (rotating), Argon2, forgot/reset.
- [x] Global `JwtAuthGuard` + `RolesGuard`, `@Public()` / `@Roles()` / `@CurrentUser()`.
- [x] Login screen, auth store, silent token refresh.
- [ ] User management UI (table + create/edit drawer) — *API ready*.
- [ ] Audit-log interceptor wired to `audit_logs`.

## Phase 2 — Catalog & Inventory 🚧
- [x] Products API (search, barcode, low-stock, stock levels).
- [x] Inventory table UI.
- [ ] Product create/edit form (React Hook Form + Zod) + image upload.
- [ ] Categories / Brands / Units CRUD.
- [ ] Stock ops: `in / out / transfer / adjust / damaged` endpoints + UI + `StockMovement`.
- [ ] Reports: stock, low-stock, valuation.

## Phase 3 — POS & Sales ✅ (core)
- [x] Atomic checkout (sale → stock → cash/customer ledger → OT).
- [x] POS UI: search, cart, payment (cash/card/mixed), change.
- [ ] Barcode scanner focus-trap + add-by-scan.
- [ ] Hold/resume carts, returns/refunds, receipt reprint.
- [ ] Print receipt + OT to thermal on completion.

## Phase 4 — Purchasing (GP) ✅ (core)
- [x] `POST/GET /purchases` → stock-in movements + vendor ledger (CREDIT vendor), price refresh, cash-out on payment.
- [x] Vendors API (CRUD + ledger statement) + Vendors UI (list, create, outstanding).
- [x] GP entry UI (vendor, items, rate/qty/tax/discount, totals, paid/balance).
- [x] Three print formats wired: divider, A4-half, A4-full.
- [ ] Partial receipts, standalone vendor payments, GP edit/cancel.

## Phase 5 — Invoicing + Sharing 🚧
- [ ] Invoice generation from sale or standalone; statuses & due dates.
- [ ] Puppeteer PDF render + storage.
- [ ] Send via Email (Nodemailer) and WhatsApp (Cloud API / wa.me).
- [ ] A4 invoice template polish.

## Phase 6 — Partners & Ledgers 🚧
- [ ] Customers/Vendors CRUD + profiles + purchase history.
- [ ] Customer/Vendor/Cash/Bank ledger views with running balances & statements.
- [ ] Credit limit enforcement, outstanding dues, aging.

## Phase 7 — Reports 🚧
- [ ] Sales (daily/weekly/monthly/yearly), purchases, stock, P&L, partner, cash.
- [ ] Export to Excel (exceljs), CSV, PDF.
- [ ] Dashboard: stock-movement & revenue-analytics charts.

## Phase 8 — Settings 🚧
- [ ] Company (logo upload), invoice, tax, printer-mapping, WhatsApp, SMTP.
- [ ] Print-template editor (`print_templates`).

## Phase 9 — Desktop & Realtime hardening 🚧
- [x] Electron shell + silent printing IPC + auto-update wiring.
- [ ] Offline mode: local cache/queue, sync on reconnect.
- [ ] Socket.IO Redis adapter; live KPI/stock/notification updates across terminals.
- [ ] Code-sign + notarize (mac) / NSIS (win), release channel.

## Phase 10 — Quality & Ops
- [ ] Unit/e2e tests (Jest + Supertest, Vitest + Testing Library, Playwright).
- [ ] CI (lint, typecheck, test, build), Dockerfiles, migrations on deploy.
- [ ] Observability (pino logs, Sentry), rate limiting, backups.
- [ ] Multi-company / multi-branch scoping.

---

### Suggested next 3 PRs
1. **Purchasing module** end-to-end (mirrors the proven Sales transaction pattern).
2. **Product create/edit + stock operations** (completes inventory).
3. **Invoice PDF + Email/WhatsApp send** (unlocks customer-facing value).
