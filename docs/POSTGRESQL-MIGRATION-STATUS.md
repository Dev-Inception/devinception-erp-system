# PostgreSQL migration and `main` merge status

Last verified: 2026-09-08
Branch: `feat/migrate-backend-to-postgresql`

## Result

`main` has been merged into this branch. The frontend is preserved exactly as
it exists on `main`; all database conversion work is isolated to the backend.
The backend now uses PostgreSQL through `pg` and Sequelize. There are no active
MongoDB, Mongoose, `MONGO_URI`, Mongo `ObjectId`, or `isMongoId` references in
the backend source or dependency manifests.

## What was merged and converted

- Existing PostgreSQL connection, migration runner, normalized core schema,
  transaction handling, row locking, and bootstrap data were retained.
- Main's newer backend modules were added to PostgreSQL: stores and store
  warehouses, suppliers, transporters, stock receipts, pending entities,
  estimates and follow-ups, expenses and approvals, sale drafts, sale returns,
  day-end controls, per-store finance, and expanded gate passes.
- Main's Mongoose model files were converted into compatibility exports that
  point to the canonical Sequelize models. This preserves old import paths
  without maintaining a second database layer.
- API validators now validate the application's 24-character hexadecimal
  PostgreSQL record IDs without Mongoose.
- Authentication session invalidation uses `token_version` in PostgreSQL.
- Fractional inventory quantities remain supported as `NUMERIC(20,6)`.

## Database migrations

| Migration                  | Purpose                                                                        | Verified status |
| -------------------------- | ------------------------------------------------------------------------------ | --------------- |
| `001-initial-schema`       | Core relational schema, constraints, indexes, journal trigger                  | Applied         |
| `002-gate-pass-processing` | Gate-pass processing fields and statuses                                       | Applied         |
| `003-integer-quantities`   | Historical whole-quantity conversion                                           | Applied         |
| `004-bootstrap-data`       | System roles, catalog defaults, initial super admin                            | Applied         |
| `005-main-backend-schema`  | Main's newer modules, store scoping, modern gate passes, fractional quantities | Applied         |

Migration `005` creates or extends all tables needed by the current backend and
backfills a default store for existing data. It also converts quantity columns
back to `NUMERIC(20,6)` because the current frontend accepts fractional values.

## Verification completed

- Backend application import smoke test: passed.
- Backend ESLint: passed.
- All 45 Sequelize models initialized and queried against PostgreSQL: passed.
- Store-to-warehouse association query: passed.
- Migration status against the configured PostgreSQL database: all five up.
- Frontend production build: passed.
- `git diff main -- frontend`: empty; no frontend divergence from `main`.
- Unresolved Git conflict paths: none.

## Intentional accounting safeguards

- Posted journal entries are append-only and enforced as balanced by a deferred
  PostgreSQL constraint trigger.
- Posted sales and stock receipts are not destructively rewritten by the new
  compatibility layer. Corrections should use returns/reversals so inventory
  and financial history stay auditable.
- Stock changes and multi-row document creation run inside PostgreSQL
  transactions where implemented.

## Remaining engineering work

- The backend test script is still a placeholder; add integration/API tests
  that create a temporary PostgreSQL database and run all migrations.
- Add concurrency tests and stronger locking/idempotency around cash/bank
  sufficient-funds checks and client retries.
- Add a controlled MongoDB-to-PostgreSQL ETL tool only if existing production
  MongoDB data must be retained. The runtime no longer depends on MongoDB.
- Decide whether production migrations should stay in `npm start` or move to a
  separate release/deployment step.
- JavaScript number precision remains a risk for monetary values above
  `Number.MAX_SAFE_INTEGER`; enforce safe ranges or adopt decimal/string
  handling if such values are possible.

## Security warning

`devinception_erp_backup.sql` appears to contain a data-bearing database dump,
including authentication and business records. Confirm whether it contains
real data. If it does, remove it from Git history and rotate any exposed
password-reset or gate-pass tokens. Do not use it as the migration mechanism;
the versioned PostgreSQL migrations are the source of truth.
