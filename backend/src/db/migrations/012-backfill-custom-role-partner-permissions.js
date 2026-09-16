/**
 * Module Access's checkbox for Customers/Vendors/Suppliers/Transporters/
 * Labour used to grant only that module's `*:read` permission — a store
 * admin checking the box expected "this role can manage it," but a custom
 * role ended up read-only for add/update (see frontend/src/lib/modules.ts,
 * MODULE_PERMISSION_BUNDLE). Any custom role whose box was already checked
 * before that fix landed is stuck with the old read-only grant, since a
 * role's stored `permissions` only change when the checkbox is toggled
 * again — this backfills it once, so existing roles don't silently stay
 * broken.
 *
 * Scoped to `is_system = false` only: the built-in roles' permission sets
 * are hand-authored in roleService.js SYSTEM_ROLES and some are
 * deliberately read-only over partners (e.g. `accountant`, and `cashier`
 * for labour) — this must not touch those.
 *
 * Labour's checkbox went through an even earlier bug where it granted
 * `sales:create` instead of any labour permission at all (see
 * frontend/src/lib/modules.ts's prior stale mapping). A role stuck in that
 * state doesn't hold `labour:read` yet, so it's untouched by the `labour`
 * block below and still shows unchecked in Module Access — re-checking the
 * box there now grants the correct bundle. This migration only needs to
 * backfill the narrower, unambiguous gap: roles that already made it to
 * `labour:read` (after the first fix, before the create/update bundle
 * existed) but are still missing create/update. `sales:create` is left
 * alone deliberately — it's also the POS module's own permission, and nothing
 * in a role's stored permissions can tell a leftover Labour mistake apart
 * from a legitimate POS grant.
 */
async function up(db, transaction) {
  await db.query(
    `
    UPDATE roles
    SET permissions = permissions || ARRAY['customers:create','customers:update']::text[]
    WHERE is_system = false
      AND permissions @> ARRAY['customers:read']::text[]
      AND NOT (permissions @> ARRAY['customers:create']::text[]);

    UPDATE roles
    SET permissions = permissions || ARRAY['vendors:create','vendors:update']::text[]
    WHERE is_system = false
      AND permissions @> ARRAY['vendors:read']::text[]
      AND NOT (permissions @> ARRAY['vendors:create']::text[]);

    UPDATE roles
    SET permissions = permissions || ARRAY['suppliers:create','suppliers:update']::text[]
    WHERE is_system = false
      AND permissions @> ARRAY['suppliers:read']::text[]
      AND NOT (permissions @> ARRAY['suppliers:create']::text[]);

    UPDATE roles
    SET permissions = permissions || ARRAY['transporters:create','transporters:update']::text[]
    WHERE is_system = false
      AND permissions @> ARRAY['transporters:read']::text[]
      AND NOT (permissions @> ARRAY['transporters:create']::text[]);

    UPDATE roles
    SET permissions = permissions || ARRAY['labour:create','labour:update']::text[]
    WHERE is_system = false
      AND permissions @> ARRAY['labour:read']::text[]
      AND NOT (permissions @> ARRAY['labour:create']::text[]);
  `,
    { transaction },
  );
}

module.exports = { name: '012-backfill-custom-role-partner-permissions', up };
