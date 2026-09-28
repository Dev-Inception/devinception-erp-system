/**
 * Bootstrap the first super admin so there is an account that can create
 * other privileged users. The account itself is defined in _superAdmin.js.
 *
 *   node src/scripts/seedSuperAdmin.js
 */
const connectDB = require('../config/db');
const { initializeModels } = require('../db/models');
const roleService = require('../services/roleService');
const { ROLES } = require('../utils/constants');
const SUPER_ADMIN = require('./_superAdmin');

async function seed() {
  const db = await connectDB();

  // The super_admin role must exist before we can create the user with it.
  await roleService.ensureSystemRoles();

  const { User } = initializeModels();
  const existing = await User.findOne({ where: { email: SUPER_ADMIN.email } });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Super admin already exists: ${existing.email}`);
  } else {
    const user = await User.create({
      name: SUPER_ADMIN.name,
      email: SUPER_ADMIN.email,
      password: SUPER_ADMIN.password,
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
