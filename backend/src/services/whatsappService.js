const ApiError = require('../utils/ApiError');

/**
 * WhatsApp sending over Meta's WhatsApp Cloud API (see docs/INTEGRATIONS.md).
 * Credentials are per-store (Settings.whatsappPhoneNumberId/
 * whatsappAccessToken, plus an optional approved template), with a fallback
 * to the super-admin's global row — see settingsService.getSettings. Unlike
 * email there's no env fallback: a sender number belongs to one business, so
 * an unconfigured store simply can't send until it (or the platform) sets
 * one up.
 *
 * Meta only delivers free-form text inside the 24h window after a customer
 * last messaged the business. Outside it, the API still answers 200 and the
 * message is silently dropped — so for real invoices a store should set an
 * approved template, and when one is set every send uses it.
 *
 * An attached PDF (the rendered invoice) is first uploaded to Meta's media
 * store, then sent by its media id — as a document message with the text as
 * its caption, or as the template's DOCUMENT header when a template is set.
 */

// Pinned Graph API version. Meta supports each version for about two years —
// bump this when it nears end of life.
const GRAPH_VERSION = 'v23.0';

// Meta wants the international number as bare digits (country code, no `+`).
// A local number starting with 0 can't be resolved to a country, so it's
// refused with a hint rather than sent somewhere wrong.
function toRecipient(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!digits) throw ApiError.badRequest('A recipient phone number is required');
  if (digits.startsWith('0')) {
    throw ApiError.badRequest(
      'Enter the WhatsApp number with its country code (e.g. 923001234567 instead of 03001234567).',
    );
  }
  return digits;
}

// Template parameters can't contain newlines, tabs or more than four
// consecutive spaces — Meta rejects the whole send if they do.
function toTemplateText(value) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {4,}/g, '   ')
    .trim();
}

function buildPayload({ to, body, templateName, templateLanguage, templateParams, media }) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  if (!templateName) {
    if (media) {
      // Document captions are capped at 1024 characters.
      const document = { id: media.id, filename: media.filename, caption: body.slice(0, 1024) };
      return { ...base, type: 'document', document };
    }
    return { ...base, type: 'text', text: { preview_url: false, body } };
  }
  const params = (templateParams || []).map(toTemplateText);
  const components = [];
  if (media) {
    components.push({
      type: 'header',
      parameters: [{ type: 'document', document: { id: media.id, filename: media.filename } }],
    });
  }
  if (params.length) {
    components.push({ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) });
  }
  return {
    ...base,
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLanguage || 'en' },
      ...(components.length && { components }),
    },
  };
}

async function metaError(res) {
  let message = `Meta request failed (${res.status})`;
  try {
    const { error } = await res.json();
    // `error_data.details` is usually the most specific explanation (e.g.
    // which template parameter was wrong); `message` is the fallback.
    if (error?.error_data?.details || error?.message) {
      message = error.error_data?.details || error.message;
    }
  } catch {
    // Meta's error body wasn't JSON — keep the generic message above.
  }
  return ApiError.badRequest(`Could not send WhatsApp message: ${message}`);
}

// Uploads a PDF to Meta's media store and returns its id. Media lives there
// for 30 days, well past the moment it's delivered.
async function uploadDocument({ phoneNumberId, accessToken, document }) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  form.append('file', new Blob([document.buffer], { type: 'application/pdf' }), document.filename);
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/media`,
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form },
  );
  if (!res.ok) throw await metaError(res);
  const { id } = await res.json();
  return { id, filename: document.filename };
}

async function sendWhatsAppMessage({
  phoneNumberId,
  accessToken,
  templateName,
  templateLanguage,
  to,
  body,
  templateParams,
  document,
}) {
  if (!phoneNumberId || !accessToken) {
    throw ApiError.badRequest(
      'WhatsApp is not set up for this store yet — link a WhatsApp number (or add Meta API details) in Settings.',
    );
  }

  const recipient = toRecipient(to);
  const media = document && (await uploadDocument({ phoneNumberId, accessToken, document }));

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(
      buildPayload({
        to: recipient,
        body,
        templateName,
        templateLanguage,
        templateParams,
        media,
      }),
    ),
  });

  if (!res.ok) throw await metaError(res);
}

module.exports = { sendWhatsAppMessage, toRecipient };
