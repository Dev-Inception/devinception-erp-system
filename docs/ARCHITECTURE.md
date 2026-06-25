# System Architecture

## 1. High-level topology

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                        │
│  ┌──────────────┐   ┌────────────────────┐   ┌──────────────────┐      │
│  │  Web (Vite)  │   │ Electron Desktop   │   │  Mobile (future) │      │
│  │  React SPA   │   │ (same React build  │   │  React Native /  │      │
│  │              │   │  + native print/   │   │  Expo)           │      │
│  └──────┬───────┘   │  auto-update)      │   └────────┬─────────┘      │
│         │           └─────────┬──────────┘            │                │
└─────────┼─────────────────────┼───────────────────────┼────────────────┘
          │ REST (JWT)          │ REST + IPC            │ REST
          │ + WebSocket         │                       │
          ▼                     ▼                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    BACKEND  (NestJS, :4000/api/v1)                     │
│                                                                        │
│  Auth ─ Users ─ Products ─ Sales/POS ─ Purchases ─ Invoices            │
│  Ledgers ─ Customers ─ Vendors ─ Reports ─ Dashboard ─ Settings        │
│                                                                        │
│  Cross-cutting: Global JwtAuthGuard + RolesGuard · ValidationPipe ·    │
│  NumberingService (gapless doc #) · RealtimeGateway (Socket.IO) ·      │
│  AuditLog interceptor · Mail / WhatsApp / PDF services                 │
└───────────────┬───────────────────────────────────┬────────────────────┘
                │ Prisma ORM                         │ external
                ▼                                    ▼
       ┌─────────────────┐              ┌──────────────────────────────┐
       │   PostgreSQL    │              │ SMTP · WhatsApp Cloud API ·   │
       │                 │              │ S3/local storage · Puppeteer  │
       └─────────────────┘              └──────────────────────────────┘
```

## 2. Layers & responsibilities

| Layer | Tech | Responsibility |
|-------|------|----------------|
| Presentation | React 18, Tailwind, shadcn/UI, Recharts | UI, routing, optimistic updates |
| Client state | Zustand (auth/session), React Query (server cache) | Token storage, data fetching/caching |
| Transport | Axios (REST), socket.io-client | API calls + live events |
| API | NestJS controllers + DTOs (class-validator) | HTTP surface, validation, RBAC |
| Domain | NestJS services | Business rules, transactions |
| Data | Prisma + PostgreSQL | Persistence, migrations |
| Desktop | Electron main/preload | Local printing, file storage, auto-update, offline |

## 3. Key design decisions

- **NestJS over plain Express** — modular DI, guards/interceptors, Swagger, testability fit an enterprise codebase.
- **Stock = append-only `StockMovement` + denormalized `StockLevel`.** Movements are the source of truth (auditable); levels are a fast cache kept in sync inside the same DB transaction.
- **Ledgers are double-entry-friendly.** Every `LedgerEntry` records `direction`, `amount`, and `balanceAfter`; account `balance` is updated atomically with the entry.
- **Gapless document numbers** via a row-locked `NumberSequence` so concurrent POS terminals never duplicate `SALE-/GP-/INV-/OT-` numbers.
- **Auth = short-lived access JWT + rotating refresh tokens** (hashed at rest, revocable). Global guard makes everything private unless `@Public()`.
- **RBAC** via `@Roles()` metadata + `RolesGuard`; `SUPER_ADMIN` bypasses all checks.
- **One React build, three shells.** The same SPA loads in the browser and Electron (`base: './'`), and is mobile-ready.

## 4. Transaction integrity (POS checkout example)

A single Prisma `$transaction` performs, atomically:
1. Allocate `SALE-####` number.
2. Create `Sale` + `SaleItem[]`.
3. For each item: decrement `StockLevel`, append `StockMovement(STOCK_OUT)`.
4. Record `CashTransaction(CASH_IN)` for cash tendered.
5. For credit portion: upsert customer `LedgerAccount`, append `LedgerEntry(DEBIT)`, update balance.
6. Allocate `OT-####` and create the `OrderTicket`.

Any failure rolls the entire sale back — no partial stock/ledger drift. On commit, `RealtimeGateway` emits `sale.created` + `stock.changed` so every dashboard/POS updates live.

## 5. Security

- Argon2id password hashing.
- JWT access (15m) + refresh (7d, rotated & revocable, SHA-256 hashed in DB).
- Global validation pipe with `whitelist` + `forbidNonWhitelisted`.
- CORS pinned to configured origins; Electron uses `contextIsolation` with a minimal preload bridge (no `nodeIntegration`).
- `AuditLog` table for sensitive actions.

## 6. Scalability path

- Stateless API → horizontal scale behind a load balancer; sticky sessions only for Socket.IO (or Redis adapter).
- PostgreSQL read replicas for reporting; materialized views for heavy dashboards.
- Background jobs (BullMQ/Redis) for PDF generation, email/WhatsApp dispatch, and report exports.
- Per-tenant schema or `companyId` scoping for multi-branch/multi-company.
