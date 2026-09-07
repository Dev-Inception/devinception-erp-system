# Printing, WhatsApp & Email Integrations

> **Status.** Printing and the invoice PDF are implemented. Email is implemented
> for password-reset only (a generic `sendEmail` exists). WhatsApp send and
> invoice email-send endpoints are **planned**, and there is no settings
> collection yet (company info comes from env). Sections below mark each.

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

## 3. WhatsApp integration 🚧 (planned)

There is **no backend WhatsApp endpoint** yet. In the current mock frontend, the
invoices page builds a `https://wa.me/<number>?text=<message>` **click-to-chat**
link and opens it in a new tab.

Planned production path (config `WHATSAPP_DRIVER`):

- **`cloud_api`** (WhatsApp Business Cloud API): host the PDF at a public/signed
  URL, then send a document/template message via `WHATSAPP_CLOUD_TOKEN` +
  `WHATSAPP_PHONE_NUMBER_ID`. Async-safe, production-grade.
- **`web`** (wa.me click-to-chat): the zero-cost option the mock already uses;
  requires the PDF (or a summary) be reachable via a public link.

> Note: the streaming PDF endpoint (§2) returns no URL, so the share flow needs a
> "render + persist to a hosted URL" step before either driver can attach the PDF.

## 4. Email integration ◑

[`backend/src/services/emailService.js`](../backend/src/services/emailService.js)
provides a generic `sendEmail({ to, subject, html, text })` over **Nodemailer/SMTP**
(`SMTP_*` env), with a **dev fallback** that logs the message to the console when
SMTP is unconfigured (or still set to the `.env.example` placeholders).

- **Implemented:** `sendPasswordResetEmail` — used by the forgot-password flow.
- **Planned:** a "Send Invoice" endpoint that attaches the rendered PDF and a
  payment summary. There is no `sentEmailAt` field on the invoice and no
  notification/event emission today (no realtime layer).

## 5. Settings that drive integrations 🚧 (planned)

There is **no settings collection** yet. Today:

- Company identity (name/address/phone) → env (`COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_PHONE`).
- SMTP → env (`SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`).
- Printer mapping (device-per-document, paper width) is left to the browser's
  print dialog — the user picks the target printer per print.

Planned: a settings module persisting `printerConfig`, `whatsappConfig`,
`emailConfig`, `invoiceConfig` (numbering/footer/terms), and `taxConfig`,
editable from a Settings UI.
