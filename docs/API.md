# API Design

Base URL: `http://localhost:5050/api` · Auth: `Authorization: Bearer <accessToken>`
Interactive docs (Swagger): `http://localhost:5050/api/docs` · Raw spec: `/api/docs.json`
Health check: `GET /api/health`

Conventions: REST, JSON, `express-validator` on writes. Every response is
`{ success, message, data? }` (or `{ success: false, message, errors? }` on error).

> **Money in requests is in rupees** (e.g. `unitPrice: 350` = ₨350) and is stored
> internally as integer paisa. There is **no realtime/WebSocket** layer.

## Authorization model

Access is **permission-based**, not role-based. Each route guards on a permission
(e.g. `sales:create`); the table below lists the permission a route requires.
Roles are `Role` documents that bundle permissions. The five built-in roles are
`cashier`, `accountant`, `manager`, `admin`, `super_admin`; `super_admin` holds
the `"*"` wildcard and passes every check. A super admin can grant any permission
to a custom role.

## Auth — `/auth`

| Method | Path               | Body                               | Access                |
| ------ | ------------------ | ---------------------------------- | --------------------- |
| POST   | `/login`           | `{ email, password }`              | public (rate-limited) |
| POST   | `/refresh`         | `{ refreshToken }` or cookie       | public                |
| POST   | `/logout`          | —                                  | public                |
| POST   | `/forgot-password` | `{ email }`                        | public (rate-limited) |
| POST   | `/reset-password`  | `{ token, password }`              | public (rate-limited) |
| GET    | `/me`              | —                                  | auth                  |
| PATCH  | `/change-password` | `{ currentPassword, newPassword }` | auth                  |

`login` → `{ user, accessToken, refreshToken }`; the refresh token is also set as
an `httpOnly; SameSite=strict` cookie. Access token 15m, refresh 7d.

## Users — `/users`

| Method | Path          | Permission          |
| ------ | ------------- | ------------------- |
| GET    | `/`           | `users:read`        |
| GET    | `/:id`        | `users:read`        |
| POST   | `/`           | `users:create`      |
| PATCH  | `/:id/role`   | `users:update_role` |
| PATCH  | `/:id/active` | `users:set_active`  |
| DELETE | `/:id`        | `users:delete`      |

There is no self-registration — users are created here by an admin/super admin.

## Roles — `/roles`

`GET /` · `GET /:id` (`roles:read`) · `GET /permissions` lists the permission
catalog (`roles:read`) · `POST /` (`roles:create`) · `PATCH /:id` (`roles:update`)
· `DELETE /:id` (`roles:delete`). Built-in roles cannot be renamed or deleted.

## Products / Inventory — `/products`, `/warehouses`

| Method | Path                         | Permission         |
| ------ | ---------------------------- | ------------------ |
| GET    | `/products?search=`          | `inventory:read`   |
| GET    | `/products/:id`              | `inventory:read`   |
| POST   | `/products`                  | `inventory:manage` |
| PATCH  | `/products/:id`              | `inventory:manage` |
| POST   | `/products/:id/adjust-stock` | `inventory:manage` |
| DELETE | `/products/:id`              | `inventory:manage` |

`adjust-stock` body: `{ warehouse, delta, unitCost?, note? }` (`delta` non-zero;
positive = receipt, negative = issue). `/warehouses` mirrors this CRUD under the
same `inventory:read` / `inventory:manage` permissions.

## Sales / POS — `/sales`

| Method | Path           | Permission     |
| ------ | -------------- | -------------- |
| POST   | `/` (checkout) | `sales:create` |
| GET    | `/?from=&to=`  | `sales:read`   |
| GET    | `/:id`         | `sales:read`   |

`POST /sales` body:

```json
{
  "customer": "optional ObjectId (omit for walk-in)",
  "warehouse": "optional (defaults to the default warehouse)",
  "discount": 0,
  "taxPercent": 0,
  "items": [{ "product": "...", "quantity": 2, "unitPrice": 350 }],
  "payment": {
    "method": "CASH | CARD | BANK_TRANSFER | ONLINE | MIXED | CREDIT",
    "cash": 700,
    "online": 0,
    "bankAccount": "ObjectId (required when money lands online)",
    "receiptRef": "transfer proof reference (required for online portion)"
  }
}
```

Allocates `SALE-YYYY-######`, decrements stock + appends `STOCK_OUT` movements,
creates the sale, and posts the revenue and COGS journal entries. `unitPrice`
defaults to the product's catalog `salePrice` when omitted.

> ⚠️ Not wrapped in a DB transaction — see [ARCHITECTURE.md §4](ARCHITECTURE.md).
> No idempotency key today, so a retried POST creates a duplicate sale.

## Purchases (GP) — `/purchases`

| Method | Path                  | Permission         |
| ------ | --------------------- | ------------------ |
| POST   | `/`                   | `purchases:create` |
| GET    | `/?from=&to=&vendor=` | `purchases:read`   |
| GET    | `/:id`                | `purchases:read`   |

`POST /purchases` body:

```json
{
  "vendor": "...",
  "warehouse": "optional",
  "vendorInvoiceNo": "supplier inv #",
  "date": "2026-06-22",
  "items": [{ "product": "...", "quantity": 10, "unitCost": 800, "taxPercent": 0 }],
  "discount": 0,
  "paid": 5000,
  "paymentMethod": "CASH | BANK_TRANSFER | ...",
  "bankAccount": "optional ObjectId",
  "notes": "optional"
}
```

Allocates `GP-YYYY-####`, increments stock + appends `STOCK_IN` movements
(updating moving-average cost), posts Dr Inventory / Cr A/P for the total, and
posts a payment (Dr A/P, Cr Cash/Bank) for any `paid` amount.

## Customers & Vendors — `/customers`, `/vendors`

CRUD under `customers:*` / `vendors:*` permissions. List rows include a computed
`outstanding` balance. Party **statements** are served by the finance module
(`/finance/ledgers/...`), not by these routers.

## Invoices — `/invoices`

| Method | Path                  | Permission        |
| ------ | --------------------- | ----------------- |
| POST   | `/`                   | `invoices:create` |
| GET    | `/?status=&customer=` | `invoices:read`   |
| GET    | `/:id`                | `invoices:read`   |
| GET    | `/:id/pdf`            | `invoices:read`   |
| POST   | `/:id/pay`            | `invoices:create` |

`POST /invoices` body mirrors a sale (`customer` required, `items[]`, `discount`,
`taxPercent`, optional `dueDate`); issuing it lowers stock and posts Dr A/R /
Cr Sales (+ Cr Tax). `POST /:id/pay` body: `{ amount, method?, bankAccount?, date? }`
posts a customer receipt and updates the invoice status (`UNPAID/PARTIAL/PAID`).
`/:id/pdf` streams a PDFKit-rendered invoice.

## Finance — `/finance` (`finance:read` / `finance:manage`)

| Method | Path                        | Permission       |
| ------ | --------------------------- | ---------------- |
| GET    | `/bank-accounts`            | `finance:read`   |
| POST   | `/bank-accounts`            | `finance:manage` |
| PATCH  | `/bank-accounts/:id`        | `finance:manage` |
| DELETE | `/bank-accounts/:id`        | `finance:manage` |
| GET    | `/bank-accounts/:id/ledger` | `finance:read`   |
| GET    | `/cash-ledger`              | `finance:read`   |
| POST   | `/cash-entry`               | `finance:manage` |
| POST   | `/payments/vendor`          | `finance:manage` |
| POST   | `/payments/customer`        | `finance:manage` |
| GET    | `/ledgers/customers`        | `finance:read`   |
| GET    | `/ledgers/vendors`          | `finance:read`   |
| GET    | `/ledgers/:kind/:id`        | `finance:read`   |

`cash-entry` body: `{ direction: "IN" | "OUT", amount, date?, note? }`.
`payments/vendor` / `payments/customer` body: `{ vendor|customer, amount, method?, bankAccount?, date?, note? }`.
`/ledgers/:kind/:id` (`kind` = `customer` | `vendor`) returns a statement with a
running balance derived from the journal.

## Dashboard & Reports (`reports:read`)

- `GET /dashboard?warehouse=` — headline KPIs + 30-day sales trend + top products.
- `GET /reports/:type?from=&to=&warehouse=` — `type` ∈
  `sales | purchases | stock-valuation | profit-loss`.

## Errors

All errors return `{ success: false, message, errors? }` with the appropriate
status code (`400` validation, `401` auth, `403` permission, `404`, `409`
duplicate, `500`). Stack traces are included only for 5xx in development. A `401`
should trigger the client's refresh-and-retry; a failed refresh logs out.
