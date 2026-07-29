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
                │ Sequelize ORM                       │ external
                ▼                                     ▼
       ┌─────────────────┐              ┌──────────────────────────────┐
       │   PostgreSQL    │              │ SMTP (email) ·                │
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
| Data         | Sequelize models → PostgreSQL                      | Persistence, constraints, indexes    |
| Desktop      | Electron main/preload                              | Local printing, auto-update          |

## 3. Key design decisions

- **Plain Express + a service layer** — thin routers delegate to `src/services`; controllers stay small via an `asyncHandler` wrapper and a central error middleware that normalizes validation, unique, and foreign-key errors.
- **Permission-based RBAC, roles as data.** Routes guard on fine-grained permissions (`requirePermission(PERMISSIONS.SALES_CREATE)`), not role names. The five built-in roles (`cashier → super_admin`) are seeded `Role` documents; a super admin can create custom roles from the fixed permission catalog. `super_admin` holds the `"*"` wildcard and passes every check.
- **Stock = append-only `StockMovement` + current `StockLevel`.** PostgreSQL row locks serialize concurrent changes to each product/warehouse balance and prevent overselling.
- **Double-entry ledger.** Normalized journal lines are protected by a deferred PostgreSQL constraint that requires balanced entries at commit.
- **Gapless document numbers** use atomic PostgreSQL upserts scoped per year.
- **Money is integer paisa** end-to-end (see `utils/money.js`) to avoid floating-point drift; values are converted to rupees only at the display boundary.
- **Auth = short-lived access JWT + refresh JWT.** Access 15m, refresh 7d. Passwords hashed with bcrypt; a password change bumps `passwordChangedAt`, which invalidates previously-issued access tokens.

## 4. Transaction integrity

Sales, purchases, invoice payments, stock movements, journals, counters, and
gate passes are committed in PostgreSQL transactions. Concurrent stock and
invoice balance changes use row locks.

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
- PostgreSQL read replicas and connection pooling for reporting scale.
- Materialized per-account/per-ref balance documents to speed up dashboard/ledger hot paths (today balances are aggregated on read).
- Background jobs for PDF generation and email/WhatsApp dispatch.
- `companyId` scoping for multi-branch / multi-company.
