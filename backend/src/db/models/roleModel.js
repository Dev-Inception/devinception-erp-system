const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineRole(db) {
  return defineModel(
    db,
    'Role',
    {
      id: id(),
      // The globally-unique technical key `users.role` foreign-keys to — a
      // custom role's is namespaced with its own store id at creation time
      // (see roleService.createRole) so two stores can each have a role
      // literally called "Cashier" without colliding. Never shown in the UI.
      name: { type: DataTypes.STRING(100), allowNull: false },
      // The human-readable text actually typed — identical to `name` for the
      // 5 built-ins; every display in the UI reads this, never `name`.
      label: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
      permissions: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
      isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      store: { type: DataTypes.STRING(24), field: 'store_id' },
    },
    { tableName: 'roles' },
  );
};
