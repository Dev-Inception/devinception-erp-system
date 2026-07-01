const settingsService = require('../services/settingsService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const out = (s) => (s && s.toJSON ? s.toJSON() : s);

// The settings object is the whole payload (no nesting key), matching the
// flat `{ companyName, address, phone, email, taxNumber, currency }` shape the
// client reads.
function serialize(settings) {
  const s = out(settings);
  return {
    companyName: s.companyName || '',
    address: s.address || '',
    phone: s.phone || '',
    email: s.email || '',
    taxNumber: s.taxNumber || '',
    currency: s.currency || 'PKR',
  };
}

const getSettings = asyncHandler(async (_req, res) => {
  const settings = await settingsService.getSettings();
  return sendSuccess(res, 200, 'Settings fetched', serialize(settings));
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.updateSettings(req.body);
  return sendSuccess(res, 200, 'Settings updated', serialize(settings));
});

module.exports = { getSettings, updateSettings };
