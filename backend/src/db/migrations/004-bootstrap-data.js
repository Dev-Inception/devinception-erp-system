const bcrypt = require('bcryptjs');
const { QueryTypes } = require('sequelize');
const env = require('../../config/env');
const { createId } = require('../id');
const { SYSTEM_ROLES, CATEGORIES, BRANDS, UNITS } = require('../bootstrapData');

const name = '004-bootstrap-data';

async function insertSystemRoles(db, transaction) {
  for (const role of SYSTEM_ROLES) {
    await db.query(
      `
      INSERT INTO roles
        (id, name, description, permissions, is_system, created_at, updated_at)
      VALUES
        ($id, $name, $description, $permissions, TRUE, NOW(), NOW())
      ON CONFLICT DO NOTHING
      `,
      {
        bind: { id: createId(), ...role },
        transaction,
      },
    );
  }
}

async function insertCatalog(db, transaction) {
  for (const categoryName of CATEGORIES) {
    await db.query(
      `
      INSERT INTO categories (id, name, created_at, updated_at)
      VALUES ($id, $name, NOW(), NOW())
      ON CONFLICT DO NOTHING
      `,
      { bind: { id: createId(), name: categoryName }, transaction },
    );
  }

  for (const brandName of BRANDS) {
    await db.query(
      `
      INSERT INTO brands (id, name, created_at, updated_at)
      VALUES ($id, $name, NOW(), NOW())
      ON CONFLICT DO NOTHING
      `,
      { bind: { id: createId(), name: brandName }, transaction },
    );
  }

  for (const unit of UNITS) {
    await db.query(
      `
      INSERT INTO units (id, name, abbreviation, created_at, updated_at)
      VALUES ($id, $name, $abbreviation, NOW(), NOW())
      ON CONFLICT DO NOTHING
      `,
      { bind: { id: createId(), ...unit }, transaction },
    );
  }
}

async function insertSuperAdmin(db, transaction) {
  const existing = await db.query("SELECT 1 FROM users WHERE role = 'super_admin' LIMIT 1", {
    type: QueryTypes.SELECT,
    transaction,
  });
  if (existing.length) return;

  if (!env.superAdmin.email || !env.superAdmin.password) {
    throw new Error(
      'SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required by 004-bootstrap-data',
    );
  }

  const email = env.superAdmin.email.trim().toLowerCase();
  const password = await bcrypt.hash(env.superAdmin.password, 10);
  await db.query(
    `
    INSERT INTO users
      (id, name, email, password, role, is_active, created_at, updated_at)
    SELECT
      $id, $name, $email, $password, 'super_admin', TRUE, NOW(), NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM users WHERE LOWER(email) = LOWER($email)
    )
    ON CONFLICT DO NOTHING
    `,
    {
      bind: {
        id: createId(),
        name: env.superAdmin.name,
        email,
        password,
      },
      transaction,
    },
  );

  const inserted = await db.query("SELECT 1 FROM users WHERE role = 'super_admin' LIMIT 1", {
    type: QueryTypes.SELECT,
    transaction,
  });
  if (!inserted.length) {
    throw new Error(
      `Cannot create the bootstrap super admin because email ${email} is already in use`,
    );
  }
}

async function up(db, transaction) {
  await insertSystemRoles(db, transaction);
  await insertCatalog(db, transaction);
  await insertSuperAdmin(db, transaction);
}

module.exports = { name, up };
