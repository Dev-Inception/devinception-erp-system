# Printing, WhatsApp & Email Integrations

## 1. Printing service architecture

```
React page ──renderTemplate(type,data)──► HTML string
        │
        ├── Electron present?  ──yes──► window.electronAPI.print({html,type,deviceName})
        │                                   └─► main.js offscreen BrowserWindow
        │                                       └─► webContents.print({ silent, pageSize, deviceName })
        │                                            └─► local thermal / A4 printer
        │
        └── Browser fallback ──► hidden <iframe> + window.print()
```

Template builders live in [`frontend/src/lib/printing.ts`](../frontend/src/lib/printing.ts);
the Electron bridge is in [`electron/preload.js`](../electron/preload.js) / [`electron/main.js`](../electron/main.js).

### Template matrix
| Document | Template type | Paper |
|----------|---------------|-------|
| Receipt | `RECEIPT_THERMAL` | 58/80 mm thermal |
| Order Ticket | `OT_THERMAL` | 58/80 mm thermal |
| GP — Divider | `GP_DIVIDER` | divider roll |
| GP — Half | `GP_A4_HALF` | A4/2 |
| GP — Full | `GP_A4_FULL` | A4 |
| Invoice | `INVOICE_A4` | A4 + PDF |

- **Thermal**: monospace, ~72 mm body width; Electron sets `pageSize` to 80 mm microns and `margins: none` for edge-to-edge roll printing.
- **A4**: branded header, item table, totals block; same HTML is handed to Puppeteer server-side to produce the **PDF** for sharing.
- `listPrinters()` enumerates OS printers so Settings can map *Receipt → thermal printer* and *Invoice → A4 printer*.

## 2. PDF generation (server)

`POST /invoices/:id/pdf` renders the `INVOICE_A4` HTML with **Puppeteer** (`puppeteer` is in backend deps) → stores under `STORAGE_DIR` (or S3) → returns a URL. PDFs are generated **before** any email/WhatsApp send.

## 3. WhatsApp integration

Button: **"Send on WhatsApp"** → `POST /invoices/:id/send-whatsapp`.

Two drivers (config `WHATSAPP_DRIVER`):
- **`cloud_api`** (WhatsApp Business Cloud API): upload the PDF as a media document, then send a template/document message to the customer's number using `WHATSAPP_CLOUD_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`. Production-grade, async-safe.
- **`web`** (WhatsApp Web / click-to-chat): open `https://wa.me/<number>?text=<encoded message + public PDF link>`. Zero-cost, good for small shops; requires the PDF be reachable via a public/signed URL.

Workflow: `Generate PDF → upload/host → send to WhatsApp → stamp invoices.sentWhatsappAt`.

## 4. Email integration

Button: **"Send Invoice"** → `POST /invoices/:id/send-email`.

- **Nodemailer** over SMTP (`SMTP_*` env). Message includes the **PDF attachment**, customer info, and a payment summary (subtotal/tax/paid/balance).
- Stamps `invoices.sentEmailAt`; failures surface as a toast and a `notification` event.

## 5. Settings that drive integrations
`company_settings` holds JSON blocks: `printerConfig` (device-per-document map, paper width),
`whatsappConfig`, `emailConfig` (SMTP), `invoiceConfig` (numbering, footer, terms),
`taxConfig` (rates, inclusive/exclusive). Editable from the Settings module.
