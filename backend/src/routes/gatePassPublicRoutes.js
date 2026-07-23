const express = require('express');
const gatePassController = require('../controllers/gatePassController');
const { validate } = require('../middlewares/validateMiddleware');
const { publicTokenParamValidator } = require('../validators/gatePassValidator');

// Unauthenticated by design: the gate pass token itself (a random 256-bit
// value, never exposed by any authenticated JSON API) is the credential here,
// the same way a boarding-pass QR authorizes its holder without a login.
const router = express.Router();

router.get('/:token', publicTokenParamValidator, validate, gatePassController.getPublicGatePass);
router.post(
  '/:token/scan',
  publicTokenParamValidator,
  validate,
  gatePassController.scanPublicGatePass,
);

module.exports = router;
