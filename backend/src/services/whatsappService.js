const ApiError = require('../utils/ApiError');

/**
 * WhatsApp sending over Twilio's WhatsApp API (see docs/INTEGRATIONS.md).
 * Credentials are per-store (Settings.twilioAccountSid/twilioAuthToken/
 * twilioWhatsAppFrom, with a fallback to the super-admin's global row — see
 * settingsService.getSettings), unlike email, which also has a global env
 * fallback: WhatsApp has no such fallback, since Twilio numbers can't be
 * shared the way a from-address can — an unconfigured store simply can't
 * send until it (or the platform) sets up Twilio.
 */

// A WhatsApp number must be in the `whatsapp:+<countrycode><number>` form
// Twilio expects — accepts a bare +E.164 number too and prefixes it.
function toWhatsAppAddress(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('whatsapp:') ? trimmed : `whatsapp:${trimmed}`;
}

async function sendWhatsAppMessage({ accountSid, authToken, from, to, body }) {
  if (!accountSid || !authToken || !from) {
    throw ApiError.badRequest(
      'WhatsApp is not configured for this store yet — add Twilio credentials in Settings.',
    );
  }
  if (!to) throw ApiError.badRequest('A recipient phone number is required');

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const params = new URLSearchParams({
    From: toWhatsAppAddress(from),
    To: toWhatsAppAddress(to),
    Body: body,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
    },
    body: params,
  });

  if (!res.ok) {
    let message = `Twilio request failed (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody?.message) message = errBody.message;
    } catch {
      // Twilio's error body wasn't JSON — keep the generic message above.
    }
    throw ApiError.badRequest(`Could not send WhatsApp message: ${message}`);
  }
}

module.exports = { sendWhatsAppMessage };
