/**
 * Permission catalog. Roles are data (see the Role model), but the set of
 * permissions a role may hold is fixed in code — that keeps authorization
 * checks in routes referring to stable constants instead of magic strings.
 *
 * A role whose permission list contains WILDCARD ("*") is treated as having
 * every permission, present and future. Only the seeded super_admin role
 * gets the wildcard; custom roles must enumerate explicit permissions.
 */
const WILDCARD = "*";

const PERMISSIONS = {
  // User management
  USERS_READ: "users:read",
  USERS_CREATE: "users:create",
  USERS_UPDATE_ROLE: "users:update_role",
  USERS_SET_ACTIVE: "users:set_active",
  USERS_DELETE: "users:delete",

  // Role management
  ROLES_READ: "roles:read",
  ROLES_CREATE: "roles:create",
  ROLES_UPDATE: "roles:update",
  ROLES_DELETE: "roles:delete",
};

const PERMISSION_VALUES = Object.values(PERMISSIONS);

// True if `permissions` (array or Set) grants `permission`, honoring wildcard.
function grants(permissions, permission) {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return set.has(WILDCARD) || set.has(permission);
}

module.exports = { PERMISSIONS, PERMISSION_VALUES, WILDCARD, grants };
