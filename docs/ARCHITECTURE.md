# System Architecture

## 1. High-level topology

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                        │
│  ┌──────────────┐   ┌────────────────────┐   ┌──────────────────┐      │
│  │  Web (Vite)  │   │ Electron Desktop   │   │  Mobile (future) │      │
│  │  React SPA   │   │ (same React build  │   │  React Native /  │      │
│  │              │   │  + native print)   │   │  Expo)           │      │
│  └──────┬───────┘   └─────────┬──────────┘   └────────┬─────────┘      │
│         │                     │                       │                │
└─────────┼─────────────────────┼───────────────────────┼────────────────┘
          │ REST (JWT)          │ REST + IPC            │ REST
          ▼                     ▼                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                 BACKEND  (Express 5, :5050/api)                        │
│                                                                        │
│  Auth ─ Users ─ Roles ─ Products/Inventory ─ Sales/POS ─ Purchases     │
│  Invoices ─ Customers ─ Vendors ─ Finance/Ledgers ─ Reports ─ Dashboard│
│                                                                        │
│  Cross-cutting: protect (JWT) + requirePermission (RBAC) ·             │
│  express-validator DTO validation · Counter (gapless doc #) ·          │
│  Mail (Nodemailer) · Invoice PDF (PDFKit) · central error handler      │
└───────────────┬────────────────────────────────────┬───────────────────┘
                │ Mongoose ODM                        │ external
                ▼                                     ▼
       ┌─────────────────┐              ┌──────────────────────────────┐
       │    MongoDB      │              │ SMTP (email) ·                │
       │                 │              │ WhatsApp Cloud API (planned)  │
       └─────────────────┘              └──────────────────────────────┘
```

> **Implemented vs. planned.** The backend REST API above is implemented. The
> frontend currently runs on an in-memory mock API and is **not yet wired to the
> backend**. There is **no realtime/Socket.IO** layer. Email send is wired
> (Nodemailer); WhatsApp send is a planned integration.

## 2. Layers & responsibilities

| Layer        | Tech                                               | Responsibility                       |
| ------------ | -------------------------------------------------- | ------------------------------------ |
| Presentation | React 18, Tailwind, Radix (shadcn-style), Recharts | UI, routing, optimistic updates      |
| Client state | Zustand (auth/session), React Query (server cache) | Token storage, data fetching/caching |
| Transport    | Axios (planned; mock today)                        | API calls                            |
| API          | Express routers + express-validator                | HTTP surface, validation, RBAC       |
| Domain       | Service modules (`src/services`)                   | Business rules, money/ledger logic   |
| Data         | Mongoose models → MongoDB                          | Persistence, indexes                 |
| Desktop      | Electron main/preload                              | Local printing, auto-update          |

## 3. Key design decisions

- **Plain Express + a service layer** — thin routers delegate to `src/services`; controllers stay small via an `asyncHandler` wrapper and a central error middleware that normalizes Mongoose `ValidationError`/`CastError`/duplicate-key into a consistent JSON shape.
- **Permission-based RBAC, roles as data.** Routes guard on fine-grained permissions (`requirePermission(PERMISSIONS.SALES_CREATE)`), not role names. The five built-in roles (`cashier → super_admin`) are seeded `Role` documents; a super admin can create custom roles from the fixed permission catalog. `super_admin` holds the `"*"` wildcard and passes every check.
- **Stock = append-only `StockMovement` + denormalized `StockLevel`.** Movements (`IN`/`OUT`/`ADJUST`) are the audit trail; `StockLevel` is the fast current `quantity` + moving-average `avgCost` per `(product, warehouse)`. Issues use an atomic conditional `$inc` (`{ quantity: { $gte: qty } }`) so concurrent sales cannot oversell into negative stock.
- **Double-entry ledger in a single document.** Each `JournalEntry` holds all of its balanced debit/credit `lines`, with a schema validator enforcing `SUM(debit) === SUM(credit)`. A post is therefore one atomic write that can never be half-posted — chosen so the system works on a **standalone MongoDB** (no replica set required). Account balances are always **derived** by aggregating lines; nothing stores a running balance.
- **Gapless document numbers** via an atomic `Counter` (`findOneAndUpdate` `$inc`, upsert) scoped per year, so concurrent POS terminals never duplicate `SALE-/GP-/INV-` numbers.
- **Money is integer paisa** end-to-end (see `utils/money.js`) to avoid floating-point drift; values are converted to rupees only at the display boundary.
- **Auth = short-lived access JWT + refresh JWT.** Access 15m, refresh 7d. Passwords hashed with bcrypt; a password change bumps `passwordChangedAt`, which invalidates previously-issued access tokens.

## 4. Transaction integrity (POS checkout)

`saleService.createSale` performs, in order:

1. Validate payment split (cash/online/credit) and stock availability.
2. Allocate the `SALE-YYYY-######` number via the atomic `Counter`.
3. For each line: atomically decrement `StockLevel` and append a `StockMovement(OUT)` at the line's `avgCost`.
4. Create the `Sale` document (with embedded items + captured COGS).
5. Post the revenue `JournalEntry` (Dr Cash/Bank/AR, Cr Sales, Cr Tax) and the COGS `JournalEntry` (Dr COGS, Cr Inventory).

> ⚠️ **Known limitation — not yet atomic across documents.** These steps are
> separate writes and are **not** wrapped in a MongoDB transaction, so a crash or
> error mid-sequence can leave stock and the ledger inconsistent. Each individual
> journal post is atomic (single document), but the overall flow is not.
> Wrapping `createSale` / `createInvoice` / `createPurchase` in
> `session.withTransaction` (which requires running MongoDB as a replica set) is a
> tracked roadmap item.

## 5. Security

- **Password hashing:** bcrypt (`bcryptjs`).
- **JWT:** separate HS256 access (15m) and refresh (7d) secrets; refresh delivered as an `httpOnly; SameSite=strict` cookie (and accepted in the body). Refresh tokens are currently **stateless** (issued anew on `/auth/refresh`, not stored/rotated/revoked server-side); a password change invalidates outstanding access tokens via `passwordChangedAt`.
- **Validation:** every write route runs `express-validator` chains; the central error handler avoids leaking stack traces outside development.
- **Hardening:** `helmet` security headers (CSP disabled so the bundled Swagger UI works), CORS pinned to `CLIENT_URL` with credentials, rate limiting on login and password-reset, password-reset tokens stored only as SHA-256 hashes, and a generic forgot-password response (no account enumeration).
- **Electron:** `contextIsolation` with a minimal preload bridge (no `nodeIntegration`).

> See the code review notes for hardening follow-ups (JWT algorithm pinning,
> refresh-token rotation/revocation, query-parameter sanitization).

## 6. Scalability path

- Stateless REST API → horizontal scale behind a load balancer.
- MongoDB replica set (also unlocks multi-document transactions for §4) + read preferences for reporting.
- Materialized per-account/per-ref balance documents to speed up dashboard/ledger hot paths (today balances are aggregated on read).
- Background jobs for PDF generation and email/WhatsApp dispatch.
- `companyId` scoping for multi-branch / multi-company.
