const express = require('express');
const userController = require('../controllers/userController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  createUserValidator,
  updateRoleValidator,
  setActiveValidator,
  idParamValidator,
} = require('../validators/userValidator');

const router = express.Router();

// Every route here requires authentication.
router.use(protect);

// Read access
router.get('/', requirePermission(PERMISSIONS.USERS_READ), userController.listUsers);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.USERS_READ),
  idParamValidator,
  validate,
  userController.getUser,
);

// Write access
router.post(
  '/',
  requirePermission(PERMISSIONS.USERS_CREATE),
  createUserValidator,
  validate,
  userController.createUser,
);
router.patch(
  '/:id/role',
  requirePermission(PERMISSIONS.USERS_UPDATE_ROLE),
  updateRoleValidator,
  validate,
  userController.updateUserRole,
);
router.patch(
  '/:id/active',
  requirePermission(PERMISSIONS.USERS_SET_ACTIVE),
  setActiveValidator,
  validate,
  userController.setUserActive,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.USERS_DELETE),
  idParamValidator,
  validate,
  userController.deleteUser,
);

module.exports = router;
