# MongoDB to PostgreSQL migration

## Goal

Move the Express backend from Mongoose/MongoDB to Sequelize/PostgreSQL without
changing the public REST API or losing historical, stock, or accounting data.
Mongo ObjectIds remain as 24-character string primary keys so URLs, JWT subject
IDs, uploaded-document references, and cross-record links continue to work.

Money remains integer paisa (`BIGINT`). Inventory quantities use
`NUMERIC(20,6)`, and moving-average cost uses `NUMERIC(30,12)`.

## Delivery sequence

1. **Foundation** — PostgreSQL connection pool, migration runner, ID strategy,
   relational schema, model definitions, and SQL-aware error normalization.
2. **Reference modules** — settings, roles/users/auth, catalog, customers,
   vendors, labour, bank accounts, and warehouses.
3. **Inventory** — products, stock levels, stock movements, row locking, and
   atomic conditional stock deductions.
4. **Documents and accounting** — counters, sales, purchases, invoices,
   journal entries/lines, payments, reports, dashboard, and gate passes.
   Every sale/purchase/payment flow becomes one PostgreSQL transaction.
5. **Data copy** — run the one-time importer against a write-frozen MongoDB,
   preserving IDs and embedded-array order.
6. **Reconciliation** — compare record counts, stock by product/warehouse,
   customer/vendor balances, trial balance, document totals, and gate-pass
   references.
7. **Cutover** — back up MongoDB, run the final import, switch `DATABASE_URL`,
   smoke-test the API, retain MongoDB read-only for the rollback window, then
   remove Mongoose and `MONGO_URI`.

## MongoDB to PostgreSQL mapping

| MongoDB document                         | PostgreSQL table(s)                                     |
| ---------------------------------------- | ------------------------------------------------------- |
| Role                                     | `roles` (`permissions` remains a PostgreSQL text array) |
| User                                     | `users`                                                 |
| Category / Brand / Unit                  | `categories` / `brands` / `units`                       |
| Product                                  | `products`                                              |
| Warehouse                                | `warehouses`                                            |
| StockLevel / StockMovement               | `stock_levels` / `stock_movements`                      |
| Customer / Vendor / BankAccount / Labour | matching first-class tables                             |
| Sale with `items[]`, `labour[]`          | `sales`, `sale_items`, `sale_labour`                    |
| GoodsPurchase with `items[]`             | `goods_purchases`, `goods_purchase_items`               |
| Invoice with `items[]`                   | `invoices`, `invoice_items`                             |
| JournalEntry with `lines[]`              | `journal_entries`, `journal_lines`                      |
| GatePass with snapshots and `items[]`    | `gate_passes`, `gate_pass_items`                        |
| Counter / Settings                       | `counters` / `settings`                                 |

Snapshot fields are intentionally retained. For example, a sale item keeps the
product name and sale price recorded at checkout even if the product changes
later.

## Commands available now

Set `DATABASE_URL` and `DATABASE_SSL`, then run:

```bash
npm run db:migrate -w backend
npm run db:migrate:status -w backend
```

Migrations are recorded in `schema_migrations` and each pending migration is
applied in its own transaction.

## Current status

- [x] Repository-wide MongoDB usage audit
- [x] PostgreSQL dependencies and pooled connection
- [x] Transactional migration runner
- [x] Initial 27-table relational schema
- [x] Deferred database constraint enforcing balanced journal entries
- [x] Sequelize model registry and associations
- [x] PostgreSQL error normalization
- [x] Schema migration and model read/write smoke tests on temporary PostgreSQL
- [x] Authentication, roles/users, settings, catalog, partners, and warehouses
- [x] Inventory with PostgreSQL row locks and atomic stock adjustments
- [x] Ledger, balances, counters, bank accounts, payments, and gate passes
- [x] Atomic PostgreSQL checkout (sale + stock + journal + gate pass)
- [x] Purchases, invoices, dashboard, and report query conversion
- [x] MongoDB data importer and row-count reconciliation
- [x] Seed conversion and deployment/runtime cutover
- [x] Removal of Mongoose from live request and startup paths

The application now starts against PostgreSQL. Mongoose and the legacy model
files are retained only by `db:import:mongo`; `MONGO_URI` is not used by live
requests and can be removed after the import and rollback window.
