# API Design

Base URL: `http://localhost:4000/api/v1` · Auth: `Authorization: Bearer <accessToken>`
Interactive docs (Swagger): `http://localhost:4000/docs`

Conventions: REST, JSON, `class-validator` DTOs, RBAC via `@Roles()`.
Roles: `SUPER_ADMIN` (bypasses all), `ADMIN`, `MANAGER`, `CASHIER`, `ACCOUNTANT`.

## Auth

| Method | Path                    | Body                     | Access |
| ------ | ----------------------- | ------------------------ | ------ |
| POST   | `/auth/login`           | `{ email, password }`    | public |
| POST   | `/auth/refresh`         | `{ refreshToken }`       | public |
| POST   | `/auth/forgot-password` | `{ email }`              | public |
| POST   | `/auth/reset-password`  | `{ token, newPassword }` | public |
| POST   | `/auth/logout`          | —                        | auth   |
| GET    | `/auth/me`              | —                        | auth   |

`login` → `{ user, accessToken, refreshToken }`. Access token 15m, refresh 7d (rotated).

## Users — `ADMIN`, `MANAGER` (write: `ADMIN`)

`GET /users` · `GET /users/:id` · `POST /users` · `PATCH /users/:id` · `DELETE /users/:id`

## Products / Inventory

| Method            | Path                          | Access            |
| ----------------- | ----------------------------- | ----------------- |
| GET               | `/products?search=&lowStock=` | auth              |
| GET               | `/products/barcode/:code`     | auth              |
| GET               | `/products/:id`               | auth              |
| POST/PATCH/DELETE | `/products[/:id]`             | `ADMIN`,`MANAGER` |

List rows include computed `currentStock` and `isLowStock`.

## Sales / POS

| Method | Path                | Access                      |
| ------ | ------------------- | --------------------------- |
| POST   | `/sales` (checkout) | `CASHIER`,`MANAGER`,`ADMIN` |
| GET    | `/sales?from=&to=`  | auth                        |
| GET    | `/sales/:id`        | auth                        |

`POST /sales` body:

```json
{
  "customerId": "optional",
  "warehouseId": "optional (defaults to default warehouse)",
  "paymentMethod": "CASH | CARD | BANK_TRANSFER | CREDIT | MIXED",
  "paidCash": 1000,
  "paidCard": 0,
  "paidBank": 0,
  "discountTotal": 0,
  "items": [{ "productId": "...", "quantity": 2, "unitPrice": 350, "taxRate": 0 }],
  "orderTicketNotes": "optional"
}
```

Atomically creates the sale, reduces stock, posts cash/customer ledger entries, and emits an Order Ticket. Emits `sale.created` + `stock.changed` over WebSocket.

## Vendors

| Method     | Path                  | Access                         |
| ---------- | --------------------- | ------------------------------ |
| GET        | `/vendors?search=`    | auth                           |
| GET        | `/vendors/:id`        | auth                           |
| GET        | `/vendors/:id/ledger` | auth                           |
| POST/PATCH | `/vendors[/:id]`      | `ADMIN`,`MANAGER`,`ACCOUNTANT` |
| DELETE     | `/vendors/:id`        | `ADMIN`,`MANAGER`              |

List rows include computed `outstanding` (payable balance). `/ledger` returns statement rows with running `balanceAfter`.

## Purchases (GP) — `MANAGER`,`ADMIN`,`ACCOUNTANT` (write)

| Method | Path                             | Access |
| ------ | -------------------------------- | ------ |
| POST   | `/purchases`                     | write  |
| GET    | `/purchases?from=&to=&vendorId=` | auth   |
| GET    | `/purchases/:id`                 | auth   |

`POST /purchases` body:

```json
{
  "vendorId": "...",
  "warehouseId": "optional",
  "invoiceNumber": "vendor inv #",
  "date": "2026-06-22",
  "items": [{ "productId": "...", "quantity": 10, "rate": 800, "taxRate": 0, "discount": 0 }],
  "paidAmount": 5000,
  "note": "optional"
}
```

Atomically: allocates `GP-####`, creates the purchase, **increments stock** + appends `STOCK_IN` movements, refreshes product purchase price, **credits the vendor ledger** for the unpaid balance, and records `CASH_OUT` for any amount paid. Emits `purchase.created` + `stock.changed`.

## Dashboard

`GET /dashboard/kpis` · `GET /dashboard/sales-trend?days=30` · `GET /dashboard/top-products?limit=5`

## Planned endpoints (scaffolded — see roadmap)

```
Invoices         POST/GET /invoices, POST /invoices/:id/pdf
                 POST /invoices/:id/send-email, /send-whatsapp
Customers        CRUD /customers, GET /customers/:id/ledger
Ledgers          GET /ledgers/cash, /ledgers/bank, /ledgers/:accountId/entries
Cash & Bank      POST /cash, POST /bank
Reports          GET /reports/sales|purchases|stock|pnl?format=json|csv|xlsx|pdf
Settings         GET/PUT /settings, /settings/print-templates
Stock ops        POST /stock/in|out|transfer|adjust|damage
```

## WebSocket events (Socket.IO, `VITE_SOCKET_URL`)

| Event           | Payload                      |
| --------------- | ---------------------------- |
| `sale.created`  | `{ saleNumber, grandTotal }` |
| `stock.changed` | `{ productIds }`             |
| `notification`  | `{ title, body, type }`      |

## Errors

Standard Nest shape: `{ statusCode, message, error }`. `401` triggers the client's silent refresh-and-retry; a failed refresh logs out.
