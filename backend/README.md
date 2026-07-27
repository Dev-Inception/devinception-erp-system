# DevInception ERP backend

Express 5 REST API backed by PostgreSQL through Sequelize. It includes JWT
authentication, RBAC, inventory, sales, purchases, invoices, double-entry
accounting, reporting, PDFs, and gate passes.

## Local setup

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run seed:roles
npm run seed:superadmin
npm run dev
```

`DATABASE_URL` is required. `DATABASE_SSL=false` is typical locally. `npm
start` applies pending migrations before listening.

## One-time MongoDB import

For an existing installation, configure `MONGO_URI` and import into an empty,
migrated PostgreSQL database:

```bash
npm run db:import:mongo
```

The legacy `src/models` directory and Mongoose dependency are used only by this
import command. Live requests use `src/db/models`.
