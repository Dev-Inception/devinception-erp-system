/**
 * Bootstrap the first super admin so there is an account that can create
 * other privileged users. Run once after configuring .env:
 *
 *   node src/scripts/seedSuperAdmin.js
 */
const connectDB = require('../config/db');
const env = require('../config/env');
const { initializeModels } = require('../db/models');
const roleService = require('../services/roleService');
const { ROLES } = require('../utils/constants');

async function seed() {
  if (!env.superAdmin.email || !env.superAdmin.password) {
    // eslint-disable-next-line no-console
    console.error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env first');
    process.exit(1);
  }

  const db = await connectDB();

  // The super_admin role must exist before we can create the user with it.
  await roleService.ensureSystemRoles();

  const { User } = initializeModels();
  const existing = await User.findOne({ where: { email: env.superAdmin.email } });
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

  await db.close();
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
