# Point of Sale — Auth & RBAC

Express + MongoDB authentication backend with JWT access/refresh tokens,
password reset by email, and role-based access control.

## Roles

`cashier` → `accountant` → `manager` → `admin` → `super_admin` (ascending authority).

- There is no public self-registration; all accounts are created by an admin
  (or super admin) via the user-management API (`POST /api/users`).
- Only a `super_admin` can create/modify/delete other super admins.

## Project structure

```
src/
  config/        env loading + validation, MongoDB connection
  models/        Mongoose schemas (user.model.js)
  services/      business logic (auth, user, token, email)
  controllers/   thin HTTP adapters over services
  routes/        route definitions + middleware wiring
  middlewares/   protect (JWT), authorize (roles), validate, error handler
  validators/    express-validator rule sets
  utils/         ApiError, ApiResponse, asyncHandler, constants (roles)
  scripts/       seedSuperAdmin.js
index.js         server bootstrap (DB connect → listen)
```

## Setup

```bash
npm install
cp .env.example .env        # then fill in secrets / Mongo URI / SMTP
npm run seed:superadmin     # creates the first super admin from .env
npm run dev                 # nodemon, or `npm start`
```

A running MongoDB instance is required (local or Atlas via `MONGO_URI`).

## Interactive API docs (Swagger)

Once the server is running, open:

- **Swagger UI:** http://localhost:5050/api/docs
- **Raw OpenAPI spec:** http://localhost:5050/api/docs.json (import into Postman/Insomnia)

To call protected endpoints: run `POST /auth/login`, copy the `accessToken`
from the response, click **Authorize** (top right), paste the token, then try
any endpoint. The authorization persists across page reloads.

## API

Base URL: `/api`

### Auth — `/api/auth`

| Method | Path               | Access        | Body |
|--------|--------------------|---------------|------|
| POST   | `/login`           | Public        | `email, password` |
| POST   | `/refresh`         | Public*       | refresh token (cookie or `refreshToken`) |
| POST   | `/logout`          | Public        | — |
| POST   | `/forgot-password` | Public        | `email` |
| POST   | `/reset-password`  | Public        | `token, password` |
| GET    | `/me`              | Authenticated | — |
| PATCH  | `/change-password` | Authenticated | `currentPassword, newPassword` |

\* Requires a valid refresh token.

### Users — `/api/users` (all require auth)

| Method | Path           | Min role | Notes |
|--------|----------------|----------|-------|
| GET    | `/`            | manager  | `?page&limit&role&search` |
| GET    | `/:id`         | manager  | |
| POST   | `/`            | admin    | `name, email, password, role` |
| PATCH  | `/:id/role`    | admin    | `role` |
| PATCH  | `/:id/active`  | admin    | `isActive` |
| DELETE | `/:id`         | admin    | |

## Auth model

- **Access token** (short-lived, default 15m) — sent in responses; pass it as
  `Authorization: Bearer <token>`.
- **Refresh token** (default 7d) — set as an httpOnly cookie scoped to
  `/api/auth`; exchange it at `/api/auth/refresh` for a new access token.
- Changing/resetting a password sets `passwordChangedAt`, invalidating any
  previously issued tokens.

## Password reset flow

1. `POST /forgot-password` with the email. A random token is generated; only
   its SHA-256 hash is stored (`passwordResetToken`, `passwordResetExpires`).
   The raw token is emailed as `CLIENT_URL/reset-password?token=...`.
   (Without SMTP configured, the email is logged to the console.)
2. `POST /reset-password` with `{ token, password }` sets the new password and
   logs the user in.

The response to `/forgot-password` is identical whether or not the email
exists, to avoid leaking which addresses are registered.

## Response shape

Success: `{ success: true, message, data }`
Error:   `{ success: false, message, errors? }`
