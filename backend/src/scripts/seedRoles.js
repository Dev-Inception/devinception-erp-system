/**
 * Seed the built-in system roles (cashier, accountant, manager, admin,
 * super_admin). Idempotent — existing roles are left untouched, so any
 * permission tweaks a super admin made survive re-running it.
 *
 *   node src/scripts/seedRoles.js
 */
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const roleService = require('../services/roleService');

async function seed() {
  await connectDB();
  await roleService.ensureSystemRoles();

  // eslint-disable-next-line no-console
  console.log(`System roles ensured: ${roleService.SYSTEM_ROLES.map((r) => r.name).join(', ')}`);

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
