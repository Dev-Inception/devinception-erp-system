/**
 * A store admin can now approve/reject their own store's expenses and put a
 * purchase price on their own store's pending entities — both were
 * previously hardcoded to super_admin only (see expenseRoutes.js and
 * pendingEntityRoutes.js). Both actions are already store-scoped in their
 * respective services via assertStoreAccess, so granting the permission to
 * `admin` only ever lets a store admin act within their own store(s).
 */
async function up(db, transaction) {
  await db.query(
    `
    UPDATE roles
    SET permissions = permissions || ARRAY['expenses:approve','pending-entities:price']::text[]
    WHERE name = 'admin' AND NOT (permissions @> ARRAY['expenses:approve']::text[]);
  `,
    { transaction },
  );
}

module.exports = { name: '009-admin-expense-approve-and-pe-price', up };
