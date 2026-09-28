const settingsService = require('../services/settingsService');
const emailService = require('../services/emailService');
const whatsappService = require('../services/whatsappService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');

/**
 * Generic "send this document" endpoints — the frontend renders the actual
 * content (the same INVOICE_A4 HTML used for printing, or a plain-text
 * summary for WhatsApp) and posts it here, so the message a customer
 * receives always matches what staff would have printed. See
 * frontend/src/lib/invoicePopup.ts (buildInvoiceHtml) and
 * frontend/src/pages/sales.tsx (SendInvoiceDialog).
 */

const sendEmail = asyncHandler(async (req, res) => {
  const { store, to, subject, html } = req.body;
  const settings = await settingsService.getSettings({ store, actor: req.user });
  // Refuse rather than silently "succeed" via the dev-console fallback
  // sendEmailAs would otherwise use — that's fine for local dev, but a
  // customer-facing send that never actually left the server shouldn't
  // report success (see emailService.isEmailConfiguredAs).
  if (!emailService.isEmailConfiguredAs(settings)) {
    throw ApiError.badRequest(
      'Email is not configured yet — add SMTP details in Settings (or ask your platform admin to set up the shared SMTP).',
    );
  }
  await emailService.sendEmailAs(settings, { to, subject, html });
  return sendSuccess(res, 200, 'Email sent');
});

const sendWhatsApp = asyncHandler(async (req, res) => {
  const { store, to, message } = req.body;
  const settings = await settingsService.getSettings({ store, actor: req.user });
  await whatsappService.sendWhatsAppMessage({
    accountSid: settings.twilioAccountSid,
    authToken: settings.twilioAuthToken,
    from: settings.twilioWhatsAppFrom,
    to,
    body: message,
  });
  return sendSuccess(res, 200, 'WhatsApp message sent');
});

module.exports = { sendEmail, sendWhatsApp };
