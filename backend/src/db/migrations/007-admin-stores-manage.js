/**
 * A store admin manages their own store's own details (name, address,
 * warehouses grouped under it) — see storeService.updateStore, which is
 * ownership-checked so this never lets them touch another tenant's store.
 * Creating/deleting a store stays super-admin-only regardless of this
 * permission (see storeRoutes.js's explicit `authorize(SUPER_ADMIN)` guards
 * on POST/DELETE) — buying or canceling a store is a subscription action.
 */
async function up(db, transaction) {
  await db.query(
    `
    UPDATE roles
    SET permissions = permissions || ARRAY['stores:manage']::text[]
    WHERE name = 'admin' AND NOT (permissions @> ARRAY['stores:manage']::text[]);
  `,
    { transaction },
  );
}

module.exports = { name: '007-admin-stores-manage', up };
