/**
 * The bootstrap super admin account — the one login that exists before
 * anyone can create other users. Shared by seedSuperAdmin.js, the
 * 002-bootstrap-data migration, and any seeder that needs an actor.
 *
 * Only used when the account doesn't exist yet; re-seeding never resets an
 * existing password. Change the password from the app after first login.
 */
const SUPER_ADMIN = {
  name: 'Super Admin',
  email: 'superadmin@devinception.com',
  password: 'ChangeMe123!',
};

module.exports = SUPER_ADMIN;
