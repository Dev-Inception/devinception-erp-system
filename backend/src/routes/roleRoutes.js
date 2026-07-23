const express = require('express');
const roleController = require('../controllers/roleController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  createRoleValidator,
  updateRoleValidator,
  idParamValidator,
} = require('../validators/roleValidator');

const router = express.Router();

// Every route requires authentication. Out of the box only super_admin
// holds the roles:* permissions, so role management is super-admin-only —
// but a super admin can delegate by granting these permissions to a role.
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.ROLES_READ), roleController.listRoles);
router.get(
  '/permissions',
  requirePermission(PERMISSIONS.ROLES_READ),
  roleController.listPermissions,
);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.ROLES_READ),
  idParamValidator,
  validate,
  roleController.getRole,
);

router.post(
  '/',
  requirePermission(PERMISSIONS.ROLES_CREATE),
  createRoleValidator,
  validate,
  roleController.createRole,
);
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.ROLES_UPDATE),
  updateRoleValidator,
  validate,
  roleController.updateRole,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.ROLES_DELETE),
  idParamValidator,
  validate,
  roleController.deleteRole,
);

module.exports = router;
