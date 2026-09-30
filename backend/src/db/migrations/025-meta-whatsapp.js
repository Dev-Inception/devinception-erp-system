/**
 * Swaps the Twilio WhatsApp config added in 018 for Meta's WhatsApp Cloud
 * API (graph.facebook.com) — see backend/src/services/whatsappService.js and
 * docs/INTEGRATIONS.md §3. Twilio credentials don't carry over to Meta, so
 * the old columns are dropped rather than renamed.
 *
 *  - whatsapp_phone_number_id: the sender's "Phone number ID" from Meta's
 *    WhatsApp → API Setup page (not the phone number itself).
 *  - whatsapp_access_token: secret, same handling as smtp_pass — never
 *    returned raw by GET /settings, only overwritten when a new value is
 *    sent. Meta tokens run well past 200 chars, hence the wide column.
 *  - whatsapp_template_name / whatsapp_template_language: optional approved
 *    message template. Meta only delivers free-form text inside the 24h
 *    window after a customer last messaged the business; a template is what
 *    lets an invoice reach any customer.
 */
async function up(db, transaction) {
  await db.query(
    `
    ALTER TABLE settings DROP COLUMN twilio_account_sid;
    ALTER TABLE settings DROP COLUMN twilio_auth_token;
    ALTER TABLE settings DROP COLUMN twilio_whatsapp_from;
    ALTER TABLE settings ADD COLUMN whatsapp_phone_number_id VARCHAR(60) NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN whatsapp_access_token VARCHAR(1000) NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN whatsapp_template_name VARCHAR(120) NOT NULL DEFAULT '';
    ALTER TABLE settings ADD COLUMN whatsapp_template_language VARCHAR(20) NOT NULL DEFAULT '';
  `,
    { transaction },
  );
}

module.exports = { name: '025-meta-whatsapp', up };
