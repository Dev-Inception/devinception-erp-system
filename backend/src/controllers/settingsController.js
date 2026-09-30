const settingsService = require('../services/settingsService');
const emailService = require('../services/emailService');
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
    invoiceNote: s.invoiceNote || '',
    logoUrl: s.logoUrl || '',
    facebook: s.facebook || '',
    instagram: s.instagram || '',
    gmail: s.gmail || '',
    tiktok: s.tiktok || '',
    website: s.website || '',
    smtpHost: s.smtpHost || '',
    smtpPort: s.smtpPort || undefined,
    smtpUser: s.smtpUser || '',
    smtpFrom: s.smtpFrom || '',
    // Secrets never round-trip raw — only whether one is already saved, so
    // the form can show "configured" without ever displaying/re-sending the
    // actual credential (see settingsService.updateSettings for the write side).
    smtpPassSet: !!s.smtpPass,
    whatsappPhoneNumberId: s.whatsappPhoneNumberId || '',
    whatsappAccessTokenSet: !!s.whatsappAccessToken,
    whatsappTemplateName: s.whatsappTemplateName || '',
    whatsappTemplateLanguage: s.whatsappTemplateLanguage || '',
    labourPricingMode: s.labourPricingMode === 'PENDING' ? 'PENDING' : 'DIRECT',
    // Whether sending an invoice would actually work for this store — the
    // same checks POST /notifications/{email,whatsapp} apply, so the Sales
    // list only offers the channels that are set up.
    emailConfigured: emailService.isEmailConfiguredAs(s),
    whatsappConfigured: !!(s.whatsappPhoneNumberId && s.whatsappAccessToken),
  };
}

const getSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings({ store: req.query.store, actor: req.user });
  return sendSuccess(res, 200, 'Settings fetched', serialize(settings));
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.updateSettings(
    { store: req.query.store || req.body.store, actor: req.user },
    req.body,
  );
  return sendSuccess(res, 200, 'Settings updated', serialize(settings));
});

module.exports = { getSettings, updateSettings };
