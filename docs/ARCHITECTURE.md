# System Architecture

> Reflects the actual code as of branch `subscription-module-implementation`.
> Supersedes the old MongoDB-era version of this doc — the backend runs on
> PostgreSQL/Sequelize, not Mongo, and the frontend is wired to the live API
> for nearly every module (a small in-memory mock in `lib/api.ts` remains only
> as an unused fallback for anything not yet matched in `tryReal()`).

## 1. High-level topology

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENT                                       │
│   React 18 + TS + Vite SPA — installable PWA, offline app-shell      │
│   (Workbox). Tailwind + Radix UI. React Query (server cache) +       │
│   Zustand (auth/session). React Router v6.                           │
└───────────────────────────────┬──────────────────────────────────────┘
                                 │ REST, JWT bearer + httpOnly refresh cookie
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                 BACKEND  (Express 5, :5050/api)                      │
│                                                                        │
│  Auth · Users · Roles · Stores · Subscriptions · Products/Catalog ·   │
│  Warehouses · Sales/POS · Vendor Sales · Stock Receipts · Damaged     │
│  Stock · Estimates · Expenses · Finance/Ledgers · Day-End · Gate      │
│  Passes (+ public QR scan) · Dashboard · Reports · Settings           │
│                                                                        │
│  Cross-cutting: protect (JWT) + requirePermission (RBAC) ·            │
│  express-validator DTO validation · service-layer Postgres            │
│  transactions · Counter (gapless doc #) · Mail (Nodemailer) ·         │
│  Invoice/PDF (PDFKit) · QR (qrcode) · central error handler           │
└───────────────┬────────────────────────────────────┬──────────────────┘
                │ Sequelize ORM                       │ external
                ▼                                     ▼
       ┌─────────────────┐              ┌──────────────────────────────┐
       │   PostgreSQL     │              │ SMTP (email) ·                │
       │                  │              │ WhatsApp send (service exists,│
       │                  │              │ integration status unverified)│
       └─────────────────┘              └──────────────────────────────┘
```

`socket.io-client` is listed as a frontend dependency but is not imported or
used anywhere in `frontend/src`, and there is no Socket.IO server on the
backend — there is no realtime layer today.

## 2. Multi-tenancy

`Store` is the tenant boundary. Catalog, roles, and settings are store-scoped
(see migrations `004`–`010`). `StoreAdmin` links owning users to the stores
they can access; `Subscription` tracks manually-managed billing per store
(amount, cycle, status — no payment gateway; a superadmin provisions stores
and subscriptions by hand via the `/stores` and `/subscriptions` API and the
matching `stores.tsx` / `subscriptions.tsx` admin pages). Most write/read
queries scope by store through `utils/storeScope.js`.

## 3. Layers & responsibilities

| Layer        | Tech                                                | Responsibility                         |
| ------------ | --------------------------------------------------- | -------------------------------------- |
| Presentation | React 18, Tailwind, Radix (shadcn-style), Recharts  | UI, routing, optimistic updates        |
| Client state | Zustand (auth/session), React Query (server cache)  | Token storage, data fetching/caching   |
| Transport    | Axios (`lib/http.ts`)                               | API calls, envelope unwrap, auth retry |
| API          | Express routers + express-validator                 | HTTP surface, validation, RBAC         |
| Domain       | Service modules (`backend/src/services/`, 39 files) | Business rules, transactions, ledger   |
| Data         | Sequelize models → PostgreSQL                       | Persistence, indexes, associations     |
| PWA          | vite-plugin-pwa (Workbox service worker)            | Installability, offline app shell      |

## 4. Key design decisions

- **Thin routers, fat services.** Routers validate and delegate to
  `backend/src/services/*`; controllers stay small via an `asyncHandler`
  wrapper and a central error middleware that normalizes Sequelize
  validation/constraint errors into a consistent JSON shape.
- **Permission-based RBAC, roles as data.** Routes guard on fine-grained
  permissions (`requirePermission(...)`), resolved from the caller's role and
  cached; `super_admin` holds a wildcard permission and passes every check.
  Coarser `authorize(...roles)` / `requireMinRole(...)` helpers also exist for
  simpler role-based checks. The five built-in roles (`cashier → super_admin`)
  are seeded; store admins can define custom roles from the permission
  catalog, store-scoped.
- **Mongo-shaped IDs on Postgres.** Primary keys are app-generated 24-char hex
  strings (`db/id.js`), not Postgres serials — chosen to keep the id shape the
  frontend already expects. `JournalLine` is the one autoincrement-`BIGINT`
  exception (append-only, never referenced externally).
- **Multi-step writes run inside real Postgres transactions.** Sale creation,
  stock receipts, expenses, bank account operations, etc. wrap every write —
  stock movement, ledger post, document creation — in one
  `sequelize.transaction(...)`, so a failure anywhere rolls back the whole
  operation. Concurrent stock updates take a row lock (`SELECT ... FOR
UPDATE` via Sequelize's `lock: true`) to prevent lost updates.
- **Stock = moving-average costing.** Receiving blends new cost into a running
  average (`StockLevel.avgCost`); issuing consumes at that average and yields
  COGS. Rounding is telescoped across issues (`calculateIssueCost`) so
  successive issues sum exactly to the original receipt value, never drifting
  by a paisa. See `backend/src/services/stockService.js`.
- **Double-entry ledger, balances always derived.** Every `JournalEntry` has
  one or more balanced `JournalLine`s (`account`, `debit`, `credit`, an
  optional `ref` to a party/bank). Nothing stores a running balance — party
  statements, cash book, and reports are all queries over `journal_lines`.
  Account kinds cover cash/bank/inventory/AR/AP (including vendor-as-buyer
  AR, supplier/labour/transport AP)/sales/COGS/opex/tax/equity — see
  `backend/src/utils/finance.js`.
- **Gapless document numbers** via an atomic `Counter` row (`key`, `scope`,
  `seq`), incremented inside the same transaction as the document it numbers,
  so concurrent POS terminals never collide on `SALE-/GP-/INV-` numbers.
- **Money is integer paisa** (`BIGINT`) end-to-end; quantities are
  fixed-scale `NUMERIC(20,6)`. `pg`'s type parsers and a Sequelize `DECIMAL`
  parser override are installed globally so both come back as JS numbers
  instead of strings — see `backend/src/db/postgres.js`.
- **Auth = short-lived access JWT + refresh JWT**, each carrying a
  `tokenVersion` (`tv`) claim. Access 15m, refresh 7d by default. Bumping a
  user's `tokenVersion` (e.g. on password change) invalidates all previously
  issued tokens without needing a server-side token store.

## 5. Frontend API layer

`frontend/src/lib/http.ts` is the real axios client: attaches the bearer
token, unwraps the backend's `{ success, message, data }` envelope, and on a
401 does a single-flight refresh-and-retry before logging out.

`frontend/src/lib/api.ts` is a compatibility facade kept from an earlier mock
API build — every call is checked against `tryReal()` first (76 routed
endpoints, effectively covering the whole app: stores, subscriptions,
products, catalog, sales, vendor sales, stock receipts, estimates, expenses,
gate passes, day-end, dashboard, reports, ledgers, users, roles, settings,
etc.). Only a call with no real handler falls through to the in-memory mock
(`mock-data.ts`) — in practice this path is effectively dead weight now
rather than a live fallback.

## 6. Security

- **Password hashing:** bcrypt (`bcryptjs`).
- **JWT:** separate HS256 access/refresh secrets; refresh token delivered as
  an httpOnly cookie (and accepted in the body as a fallback). Invalidated on
  password change via `tokenVersion`, not server-side revocation/rotation
  tracking.
- **Validation:** write routes run `express-validator` chains; the central
  error handler avoids leaking stack traces outside development.
- **Hardening:** `helmet` security headers (CSP disabled so the bundled
  Swagger UI at `/api/docs` works), CORS pinned to a single `CLIENT_URL` with
  credentials, rate limiting on login (10/15min, successful logins not
  counted) and password reset (5/hour) via `express-rate-limit`.

## 7. Scalability path

- Stateless REST API → horizontal scale behind a load balancer.
- Postgres already supports multi-statement transactions (unlike the prior
  MongoDB standalone setup), so the main scaling levers are read replicas for
  reporting and connection pooling (`DATABASE_POOL_MAX`, default 10).
- Uploaded files (`backend/uploads/`) are local disk — fine for a single
  instance, but blocks horizontal scaling and is lost on redeploy under an
  ephemeral filesystem (e.g. Render's free plan). Needs object storage
  (S3-compatible) before scaling past one instance.
- Background jobs for PDF generation and email/WhatsApp dispatch, currently
  synchronous in the request path.
