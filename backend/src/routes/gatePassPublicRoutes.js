const express = require('express');
const gatePassController = require('../controllers/gatePassController');
const { validate } = require('../middlewares/validateMiddleware');
const { protect } = require('../middlewares/authMiddleware');
const {
  publicTokenParamValidator,
  processGatePassValidator,
} = require('../validators/gatePassValidator');

const router = express.Router();

router.get('/:token', publicTokenParamValidator, validate, gatePassController.getPublicGatePass);
router.post(
  '/:token/process',
  protect,
  processGatePassValidator,
  validate,
  gatePassController.processGatePass,
);

module.exports = router;
