# DevInception ERP — Backend (skeleton)

Node.js + Express + MongoDB (Mongoose) + TypeScript. This is a **scaffold** — the
folder structure and wiring are in place, but the domain logic is intentionally
left as stubs to be implemented.

## Structure

```
src/
  server.ts          # entry point — boots the app, connects to Mongo, listens
  app.ts             # builds the Express app (middleware, routes, error handler)
  config/
    env.ts           # typed environment config
    db.ts            # Mongoose connection
  models/            # Mongoose schemas/models (one file per entity)
  routes/            # Express routers (one file per resource) — mounted in index.ts
  controllers/       # request handlers (thin; call services)
  services/          # business logic + DB access
  middleware/        # cross-cutting middleware (error handler, auth, validation, …)
```

## Getting started

```bash
cp .env.example .env      # then fill in MONGODB_URI etc.
npm install
npm run dev               # tsx watch — starts on http://localhost:4000/api/v1
```

The server currently exposes a single health check at `GET /api/v1/health`.
Database connection in `server.ts` is commented out so it boots without Mongo;
enable `connectDb()` once your `.env` is configured.

## Next steps

1. Define Mongoose models in `src/models/` and re-export from `models/index.ts`.
2. Add routers in `src/routes/` and mount them in `routes/index.ts`.
3. Put domain logic in `src/services/`, keep `controllers/` thin.
4. Add auth (JWT), validation, and any realtime/PDF/email features as needed.
