/**
 * Bootstrap the first super admin so there is an account that can create
 * other privileged users. Run once after configuring .env:
 *
 *   node src/scripts/seedSuperAdmin.js
 */
const { getPostgres, closePostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const env = require('../config/env');
const roleService = require('../services/roleService');
const { ROLES } = require('../utils/constants');
const { User } = initializeModels();

async function seed() {
  if (!env.superAdmin.email || !env.superAdmin.password) {
    // eslint-disable-next-line no-console
    console.error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env first');
    process.exit(1);
  }

  await getPostgres().authenticate();

  // The super_admin role must exist before we can create the user with it.
  await roleService.ensureSystemRoles();

  const existing = await User.findOne({
    where: { email: env.superAdmin.email.trim().toLowerCase() },
  });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Super admin already exists: ${existing.email}`);
  } else {
    const user = await User.create({
      name: env.superAdmin.name,
      email: env.superAdmin.email,
      password: env.superAdmin.password,
      role: ROLES.SUPER_ADMIN,
    });
    // eslint-disable-next-line no-console
    console.log(`Super admin created: ${user.email}`);
  }

  await closePostgres();
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
