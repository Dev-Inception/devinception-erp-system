/**
 * Adds per-store notification config to `settings`: SMTP (for emailing a
 * sale invoice to a customer) and Twilio WhatsApp (for sending it as a
 * WhatsApp message) — see SendInvoiceDialog in frontend/src/pages/sales.tsx
 * and backend/src/services/{emailService,whatsappService}.js.
 *
 * `smtp_pass`/`twilio_auth_token` are secrets: GET /settings never returns
 * them raw (see settingsController.serialize), only a `*Set` boolean, and
 * PUT /settings leaves them untouched unless a new value is actually sent
 * (see settingsService.updateSettings) — so the UI never needs to redisplay
 * (or accidentally blank out) a saved credential.
 */
async function up(db, transaction) {
  await db.query(
    `
    ALTER TABLE settings ADD COLUMN smtp_host VARCHAR(200) NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN smtp_port INTEGER;
    ALTER TABLE settings ADD COLUMN smtp_user VARCHAR(200) NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN smtp_pass VARCHAR(300) NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN smtp_from VARCHAR(200) NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN twilio_account_sid VARCHAR(120) NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN twilio_auth_token VARCHAR(120) NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN twilio_whatsapp_from VARCHAR(40) NOT NULL DEFAULT '';
  `,
    { transaction },
  );
}

module.exports = { name: '018-notification-settings', up };
