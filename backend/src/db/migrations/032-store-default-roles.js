/**
 * Gives every existing store its own default roles — Admin, Manager,
 * Cashier and Accountant — as store-scoped roles, so they appear in each
 * store's Permissions matrix. New stores get them at creation (see
 * roleService.ensureStoreDefaultRoles). A store that already has a role of
 * the same name keeps it as it is.
 */
const roleService = require('../../services/roleService');

async function up(db, transaction) {
  const [stores] = await db.query('SELECT id FROM stores', { transaction });
  for (const store of stores) {
    await roleService.ensureStoreDefaultRoles(store.id, { transaction });
  }
}

module.exports = { name: '032-store-default-roles', up };
