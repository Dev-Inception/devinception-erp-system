/**
 * Same class of bug as 012, for three more Module Access checkboxes whose
 * governing permission (used both for visibility and, until the matching
 * frontend fix, for what a checkbox toggle actually granted) covered only
 * read:
 *
 *  - Sales: `sales:read` only — editing/refunding/recording a payment
 *    against an existing sale needs `sales:update` too (creating a brand
 *    new one is the separate POS module's `sales:create`, intentionally
 *    left alone here).
 *  - Estimates: `estimates:read` only — create/update/follow-up/mark-lost
 *    all need `estimates:create`/`estimates:update`.
 *  - Stock Receiving / Products: `inventory:read` only — all writes for
 *    either module need the single combined `inventory:manage` (the
 *    backend has one permission covering Stock Receiving, Products,
 *    Categories, Units and Warehouses together, so this one column
 *    backfills both checkboxes' worth of existing roles at once).
 *
 * Scoped to `is_system = false` only, same reasoning as 012 — built-in
 * roles are hand-authored in roleService.js SYSTEM_ROLES and must not be
 * touched by this kind of blanket backfill.
 *
 * Pending Entities (`finance:read` -> also needs `pending-entities:price`)
 * is deliberately NOT included here: `finance:read` is also Ledgers'
 * governing permission, and a role holding it could have gotten there via
 * either checkbox — backfilling `pending-entities:price` onto every such
 * role risks handing pricing/payable-creating ability to a role that only
 * ever meant to grant read-only Ledgers access. That one has to be
 * re-checked by hand per role.
 */
async function up(db, transaction) {
  await db.query(
    `
    UPDATE roles
    SET permissions = permissions || ARRAY['sales:update']::text[]
    WHERE is_system = false
      AND permissions @> ARRAY['sales:read']::text[]
      AND NOT (permissions @> ARRAY['sales:update']::text[]);

    UPDATE roles
    SET permissions = permissions || ARRAY['estimates:create','estimates:update']::text[]
    WHERE is_system = false
      AND permissions @> ARRAY['estimates:read']::text[]
      AND NOT (permissions @> ARRAY['estimates:create']::text[]);

    UPDATE roles
    SET permissions = permissions || ARRAY['inventory:manage']::text[]
    WHERE is_system = false
      AND permissions @> ARRAY['inventory:read']::text[]
      AND NOT (permissions @> ARRAY['inventory:manage']::text[]);
  `,
    { transaction },
  );
}

module.exports = { name: '013-backfill-custom-role-sales-estimates-inventory', up };
