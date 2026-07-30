# DevInception ERP backend

Express 5 REST API backed by PostgreSQL through Sequelize. It includes JWT
authentication, RBAC, inventory, sales, purchases, invoices, double-entry
accounting, reporting, PDFs, and gate passes.

## Local setup

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

`DATABASE_URL`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD` are required.
`DATABASE_SSL=false` is typical locally. Migrations also bootstrap system
roles, the starter catalog, and the first super admin. Each migration runs in
its own PostgreSQL transaction. `npm start` applies pending migrations before
listening.

All persistence uses the normalized Sequelize models in `src/db/models`.
Every PostgreSQL table has a separate `*Model.js` schema file; `index.js`
provides the model registry and `associations.js` contains cross-table
relationships.
