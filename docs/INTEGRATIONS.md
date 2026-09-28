# Printing, WhatsApp & Email Integrations

> **Status.** Printing and the invoice PDF are implemented. Password-reset
> email and sending a sale invoice by email or WhatsApp are both implemented
> (`POST /notifications/email` and `POST /notifications/whatsapp` — see §3/§4).
> Settings is a real per-store collection (§5), not env-only anymore. Sections
> below mark each.

## 1. Printing service (frontend) ✅

```
React page ──renderTemplate(type,data)──► HTML string
        │
        └── hidden <iframe> + window.print() ──► browser print dialog
                                                      └─► local thermal / A4 printer
```

`renderTemplate(type, data)` and `printDocument(type, data)` live in
[`frontend/src/lib/printing.ts`](../frontend/src/lib/printing.ts). The app runs as
a PWA (see [`vite.config.ts`](../frontend/vite.config.ts)); there is no native
desktop shell, so printing always goes through the browser's print dialog — pick
the target printer (thermal or A4) there.

### Template matrix

| Document     | Template type     | Paper            |
| ------------ | ----------------- | ---------------- |
| Receipt      | `RECEIPT_THERMAL` | 58/80 mm thermal |
| Order Ticket | `OT_THERMAL`      | 58/80 mm thermal |
| GP — Divider | `GP_DIVIDER`      | divider roll     |
| GP — Half    | `GP_A4_HALF`      | A4/2             |
| GP — Full    | `GP_A4_FULL`      | A4               |
| Invoice      | `INVOICE_A4`      | A4               |

- **Thermal**: monospace, ~72 mm body width.
- **A4**: branded header, item table, totals block.
- "Order Ticket" is a **print template only** — there is no `OrderTicket` entity
  in the data model; the POS would render it from the sale at print time.
- These templates are part of the frontend, which currently runs on mock data;
  the browser-fallback path in `printDocument` has a couple of rough edges
  (non-null-asserted `contentDocument`/`contentWindow`, unescaped interpolation)
  worth hardening before production.

## 2. Invoice PDF generation (server) ✅

`GET /invoices/:id/pdf` renders the invoice with **PDFKit**
([`backend/src/services/invoicePdfService.js`](../backend/src/services/invoicePdfService.js))
and **streams the bytes straight to the HTTP response** — it is drawn with PDFKit
primitives (not from the frontend `INVOICE_A4` HTML), and it is **not stored** to
disk/S3 and does not return a URL. Company name/address/phone come from env
(`COMPANY_*`); all amounts are converted from paisa to rupees for display.

The stream lifecycle handles client disconnects (`res.on("close")` destroys the
doc) and surfaces a clean error only if generation fails before any bytes are sent.

## 3. WhatsApp integration ✅ (Twilio)

`POST /notifications/whatsapp` (`{ store?, to, message }`, gated by
`sales:read`) sends a plain-text message via **Twilio's WhatsApp API**
([`backend/src/services/whatsappService.js`](../backend/src/services/whatsappService.js)),
using `Settings.twilioAccountSid` / `twilioAuthToken` / `twilioWhatsAppFrom`
(per store, with a fallback to the super-admin's global row — see §5). There
is **no fallback to a shared/platform Twilio number** — an unconfigured store
gets a clear 400 ("add Twilio credentials in Settings") rather than silently
using someone else's sender.

The frontend builds the message (a short plain-text invoice summary — number,
date, total, balance due — see `sendSaleInvoiceWhatsApp` in
[`frontend/src/lib/invoicePopup.ts`](../frontend/src/lib/invoicePopup.ts)) and
posts it here; there is no rich WhatsApp layout (no PDF/document attachment).
The Sales list's "Send via WhatsApp" action (`frontend/src/pages/sales.tsx` →
`SendInvoiceDialog`) defaults the recipient to the customer's phone on file,
editable per send.

Setup (per store, in Settings → Notifications): sign up at twilio.com, grab
the Account SID + Auth Token from the console, and either join the WhatsApp
Sandbox for testing or apply for a production WhatsApp Sender.

## 4. Email integration ✅

[`backend/src/services/emailService.js`](../backend/src/services/emailService.js)
provides:

- `sendEmail({ to, subject, html, text })` — the original generic sender over
  the platform's shared **Nodemailer/SMTP** (`SMTP_*` env), with a **dev
  fallback** that logs to the console when SMTP is unconfigured (or still set
  to the `.env.example` placeholders). Used by `sendPasswordResetEmail`.
- `sendEmailAs(settings, { to, subject, html, text })` — sends using a
  _store's own_ SMTP credentials (`Settings.smtp*`, resolved with the
  super-admin fallback by `settingsService.getSettings` — see §5), falling
  back to the shared platform SMTP above if the store hasn't configured its
  own, and to the same dev-console fallback if neither is.

`POST /notifications/email` (`{ store?, to, subject, html }`, gated by
`sales:read`) is the "Send Invoice" endpoint: the frontend renders the exact
same `INVOICE_A4` HTML used for printing (`buildInvoiceHtml` in
`invoicePopup.ts`) and posts it here to be emailed via `sendEmailAs`. The
Sales list's "Send via Email" action defaults the recipient to the customer's
email on file, editable per send. There is no `sentEmailAt` field on the sale
and no notification/event emission (no realtime layer) — sending is fire-and-forget from the caller's point of view beyond the success/error toast.

## 5. Settings that drive integrations ✅

`Settings` (one row per store, plus a `store IS NULL` global row — see
[`backend/src/services/settingsService.js`](../backend/src/services/settingsService.js))
persists company identity, invoice note, branding/social links, and
notification config (SMTP + Twilio WhatsApp). A store row that hasn't set a
given field falls back to the super-admin's global row (`FALLBACK_FIELDS`),
so a store only needs to override what's different for it; `env.company.*`
only seeds the _global_ row's initial defaults now, it isn't read live.

Secrets (`smtpPass`, `twilioAuthToken`) never round-trip raw over
`GET /settings` — only a `smtpPassSet`/`twilioAuthTokenSet` boolean — and
`PUT /settings` only overwrites one when a non-empty value is actually sent,
so the Settings UI can't display or accidentally blank out a saved
credential (see `settingsController.serialize` / `settingsService.updateSettings`).

Printer mapping (device-per-document, paper width) is still left to the
browser's print dialog — the user picks the target printer per print; there
is no `printerConfig` in Settings.
