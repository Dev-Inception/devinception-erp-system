const { QueryTypes } = require('sequelize');

/**
 * Two different stores must be able to each name a custom role "Cashier"
 * without colliding — but `roles.name` is a plain, table-wide-unique column
 * that `users.role` foreign-keys to directly (see migration 001), so the
 * literal stored name has to stay globally unique regardless.
 *
 * Fix: keep `name` as the globally-unique *technical* key (what `users.role`
 * actually stores, and what permission lookups key off), but namespace a
 * custom role's technical name with its own store id at creation time
 * (`<storeId>__<slug>` — see roleService.createRole) so two stores' "cashier"
 * can never collide. A new `label` column carries the human-readable text
 * actually typed (`name` for the 5 built-ins, unchanged) — every display in
 * the UI reads `label`, never the technical `name`.
 *
 * The one existing custom role in this database has no user assigned to it
 * yet (confirmed before writing this), so renaming it here is risk-free —
 * this would need to also rewrite any `users.role` pointing at the old name
 * in lockstep if that weren't the case.
 */
async function up(db, transaction) {
  await db.query('ALTER TABLE roles ADD COLUMN label VARCHAR(100);', { transaction });
  await db.query('UPDATE roles SET label = name;', { transaction });

  const customRoles = await db.query(
    'SELECT id, name, store_id FROM roles WHERE is_system = false',
    {
      transaction,
      type: QueryTypes.SELECT,
    },
  );
  for (const role of customRoles) {
    if (!role.store_id) continue; // a super-admin-authored global custom role keeps its plain name
    const slug =
      role.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-+|-+$)/g, '')
        .slice(0, 70) || 'role';
    const newName = `${role.store_id}__${slug}`;
    if (newName === role.name) continue;
    await db.query('UPDATE roles SET name = :newName WHERE id = :id', {
      replacements: { newName, id: role.id },
      transaction,
    });
  }

  await db.query('ALTER TABLE roles ALTER COLUMN label SET NOT NULL;', { transaction });
}

module.exports = { name: '008-store-scoped-role-names', up };
