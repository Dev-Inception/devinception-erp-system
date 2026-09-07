const bcrypt = require('bcryptjs');
const { QueryTypes } = require('sequelize');
const { createId } = require('../id');
const { ROLES } = require('../../utils/constants');
const { PERMISSIONS, WILDCARD } = require('../../utils/permissions');
const env = require('../../config/env');

// Mirrors services/roleService.js's SYSTEM_ROLES exactly, since that service
// module isn't reachable from a migration (it depends on the Sequelize
// models, which don't exist until after this migration runs).
const SYSTEM_ROLES = [
  {
    name: ROLES.CASHIER,
    description: 'Point-of-sale operator',
    permissions: [
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.CUSTOMERS_CREATE,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.GATE_PASSES_READ,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.ESTIMATES_READ,
      PERMISSIONS.ESTIMATES_CREATE,
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.EXPENSES_MANAGE,
    ],
  },
  {
    name: ROLES.ACCOUNTANT,
    description: 'Finance / reporting',
    permissions: [
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.SUPPLIERS_READ,
      PERMISSIONS.TRANSPORTERS_READ,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.GATE_PASSES_READ,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.ESTIMATES_READ,
      PERMISSIONS.FINANCE_READ,
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.EXPENSES_MANAGE,
      PERMISSIONS.REPORTS_READ,
    ],
  },
  {
    name: ROLES.MANAGER,
    description: 'Can view staff and run day-to-day operations',
    permissions: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.VENDORS_CREATE,
      PERMISSIONS.VENDORS_UPDATE,
      PERMISSIONS.SUPPLIERS_READ,
      PERMISSIONS.SUPPLIERS_CREATE,
      PERMISSIONS.SUPPLIERS_UPDATE,
      PERMISSIONS.TRANSPORTERS_READ,
      PERMISSIONS.TRANSPORTERS_CREATE,
      PERMISSIONS.TRANSPORTERS_UPDATE,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.CUSTOMERS_CREATE,
      PERMISSIONS.CUSTOMERS_UPDATE,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_MANAGE,
      PERMISSIONS.GATE_PASSES_READ,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.SALES_UPDATE,
      PERMISSIONS.ESTIMATES_READ,
      PERMISSIONS.ESTIMATES_CREATE,
      PERMISSIONS.ESTIMATES_UPDATE,
      PERMISSIONS.FINANCE_READ,
      PERMISSIONS.REPORTS_READ,
    ],
  },
  {
    name: ROLES.ADMIN,
    description: 'Manages staff accounts, operations and finance',
    permissions: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.USERS_CREATE,
      PERMISSIONS.USERS_UPDATE,
      PERMISSIONS.USERS_UPDATE_ROLE,
      PERMISSIONS.USERS_SET_ACTIVE,
      PERMISSIONS.USERS_SET_PASSWORD,
      PERMISSIONS.USERS_DELETE,
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.VENDORS_CREATE,
      PERMISSIONS.VENDORS_UPDATE,
      PERMISSIONS.VENDORS_DELETE,
      PERMISSIONS.SUPPLIERS_READ,
      PERMISSIONS.SUPPLIERS_CREATE,
      PERMISSIONS.SUPPLIERS_UPDATE,
      PERMISSIONS.SUPPLIERS_DELETE,
      PERMISSIONS.TRANSPORTERS_READ,
      PERMISSIONS.TRANSPORTERS_CREATE,
      PERMISSIONS.TRANSPORTERS_UPDATE,
      PERMISSIONS.TRANSPORTERS_DELETE,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.CUSTOMERS_CREATE,
      PERMISSIONS.CUSTOMERS_UPDATE,
      PERMISSIONS.CUSTOMERS_DELETE,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_MANAGE,
      PERMISSIONS.GATE_PASSES_READ,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.SALES_UPDATE,
      PERMISSIONS.ESTIMATES_READ,
      PERMISSIONS.ESTIMATES_CREATE,
      PERMISSIONS.ESTIMATES_UPDATE,
      PERMISSIONS.ESTIMATES_DELETE,
      PERMISSIONS.FINANCE_READ,
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.EXPENSES_MANAGE,
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.SETTINGS_READ,
      PERMISSIONS.SETTINGS_MANAGE,
    ],
  },
  {
    name: ROLES.SUPER_ADMIN,
    description: 'Full access, including role management',
    permissions: [WILDCARD],
  },
];

const CATEGORIES = ['Electronics', 'Accessories', 'Office Supplies'];
const BRANDS = ['Logitech', 'Keychron', 'Generic'];
const UNITS = [
  { name: 'Piece', abbreviation: 'pc' },
  { name: 'Box', abbreviation: 'box' },
];

async function insertSystemRoles(db, transaction) {
  for (const role of SYSTEM_ROLES) {
    await db.query(
      `INSERT INTO roles (id, name, description, permissions, is_system)
       VALUES (:id, :name, :description, ARRAY(SELECT jsonb_array_elements_text(:permissions::jsonb)), true)
       ON CONFLICT (name) DO NOTHING`,
      {
        replacements: {
          id: createId(),
          name: role.name,
          description: role.description,
          // Named replacements flatten a plain JS array into a comma list
          // (useful for `IN (:x)`, not an ARRAY literal), so it's passed as
          // JSON text and unpacked into text[] by the query itself instead.
          permissions: JSON.stringify(role.permissions),
        },
        transaction,
      },
    );
  }
}

async function insertCatalog(db, transaction) {
  for (const name of CATEGORIES) {
    await db.query(
      `INSERT INTO categories (id, name) VALUES (:id, :name)
       ON CONFLICT DO NOTHING`,
      { replacements: { id: createId(), name }, transaction },
    );
  }
  for (const name of BRANDS) {
    await db.query(
      `INSERT INTO brands (id, name) VALUES (:id, :name)
       ON CONFLICT DO NOTHING`,
      { replacements: { id: createId(), name }, transaction },
    );
  }
  for (const unit of UNITS) {
    await db.query(
      `INSERT INTO units (id, name, abbreviation) VALUES (:id, :name, :abbreviation)
       ON CONFLICT DO NOTHING`,
      { replacements: { id: createId(), ...unit }, transaction },
    );
  }
}

async function insertSuperAdmin(db, transaction) {
  if (!env.superAdmin.email || !env.superAdmin.password) {
    throw new Error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD before running migrations');
  }

  const existing = await db.query(`SELECT id FROM users WHERE LOWER(email) = LOWER(:email)`, {
    replacements: { email: env.superAdmin.email },
    transaction,
    type: QueryTypes.SELECT,
  });
  if (existing.length) return;

  const hashed = await bcrypt.hash(env.superAdmin.password, 10);
  await db.query(
    `INSERT INTO users (id, name, email, password, role)
     VALUES (:id, :name, :email, :password, :role)`,
    {
      replacements: {
        id: createId(),
        name: env.superAdmin.name,
        email: env.superAdmin.email,
        password: hashed,
        role: ROLES.SUPER_ADMIN,
      },
      transaction,
    },
  );

  // Guard against a differently-cased duplicate slipping through the
  // case-insensitive check above due to a race with another migration run.
  const recheck = await db.query(
    `SELECT COUNT(*)::int AS count FROM users WHERE LOWER(email) = LOWER(:email)`,
    { replacements: { email: env.superAdmin.email }, transaction, type: QueryTypes.SELECT },
  );
  if (recheck[0].count !== 1) {
    throw new Error(
      `Super admin email ${env.superAdmin.email} already exists with different casing`,
    );
  }
}

async function insertDefaultSettings(db, transaction) {
  await db.query(
    `INSERT INTO settings (id, key, company_name, currency)
     VALUES (:id, 'app', :companyName, 'PKR')
     ON CONFLICT (key) DO NOTHING`,
    { replacements: { id: createId(), companyName: env.company.name }, transaction },
  );
}

async function up(db, transaction) {
  await insertSystemRoles(db, transaction);
  await insertCatalog(db, transaction);
  await insertSuperAdmin(db, transaction);
  await insertDefaultSettings(db, transaction);
}

module.exports = { name: '002-bootstrap-data', up };
