const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const roleService = require('../services/roleService');
const { ROLE_HIERARCHY } = require('../utils/constants');
const { WILDCARD } = require('../utils/permissions');

/**
 * Authorize by explicit role list. Must run after `protect`.
 *
 *   router.delete("/:id", protect, authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN), handler)
 */
function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Not authenticated'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    next();
  };
}

/**
 * Authorize by minimum rank in the role hierarchy, e.g. requireMinRole(MANAGER)
 * lets manager, admin and super_admin through.
 */
function requireMinRole(minRole) {
  const minIndex = ROLE_HIERARCHY.indexOf(minRole);

  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Not authenticated'));
    }
    const userIndex = ROLE_HIERARCHY.indexOf(req.user.role);
    if (userIndex < minIndex) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    next();
  };
}

/**
 * Permission-based authorization. Must run after `protect`. Resolves the
 * caller's role to its permission set (cached) and allows the request only
 * if the role holds every required permission (or the wildcard).
 *
 *   router.post("/", protect, requirePermission(PERMISSIONS.USERS_CREATE), handler)
 */
function requirePermission(...required) {
  return asyncHandler(async (req, _res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized('Not authenticated');
    }
    const perms = await roleService.getPermissions(req.user.role);
    const ok = perms.has(WILDCARD) || required.every((p) => perms.has(p));
    if (!ok) {
      throw ApiError.forbidden('You do not have permission to perform this action');
    }
    next();
  });
}

module.exports = { authorize, requireMinRole, requirePermission };
