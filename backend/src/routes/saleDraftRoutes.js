const express = require('express');
const saleDraftController = require('../controllers/saleDraftController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const { idParamValidator, saveSaleDraftValidator } = require('../validators/saleDraftValidator');

const router = express.Router();
router.use(protect);
router.use(requirePermission(PERMISSIONS.SALES_CREATE));

router.get('/', saleDraftController.listSaleDrafts);
router.post('/', saveSaleDraftValidator, validate, saleDraftController.createSaleDraft);
router.patch(
  '/:id',
  idParamValidator,
  saveSaleDraftValidator,
  validate,
  saleDraftController.updateSaleDraft,
);
router.delete('/:id', idParamValidator, validate, saleDraftController.deleteSaleDraft);

module.exports = router;
