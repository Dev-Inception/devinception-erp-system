/**
 * Application-wide roles. Order is significant: higher index = more authority.
 * Use the ROLES object everywhere instead of magic strings.
 */
const ROLES = {
  CASHIER: "cashier",
  ACCOUNTANT: "accountant",
  MANAGER: "manager",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
};

const ROLE_VALUES = Object.values(ROLES);

// Hierarchy used for "at least this role" style checks.
const ROLE_HIERARCHY = [
  ROLES.CASHIER,
  ROLES.ACCOUNTANT,
  ROLES.MANAGER,
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
];

module.exports = { ROLES, ROLE_VALUES, ROLE_HIERARCHY };
