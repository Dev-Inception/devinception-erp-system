# Backend To-Do — what the frontend still needs

The frontend is integrated against the **real backend** through an adapter in
`frontend/src/lib/api.ts` (it maps the backend's envelope / paisa / field names to the
shapes the pages expect — that mapping lives on the frontend and is **not** backend
work). This document lists **only the things the frontend needs from the backend** that
aren't provided yet.

**Integrated and working today:** Auth/login, Warehouses, Products, Stock-adjust,
Customers, Vendors, Sales/POS, Purchases, Dashboard, Reports, Cash, Bank (list/create),
Ledgers.

**Still blocked (need backend work below):** Invoices, Settings, Uploads.

---

## 1. Features the frontend needs that the backend doesn't provide

These can't be synthesized by the frontend adapter — the listed pages stay on mock data
or are partially broken until the backend adds them.

- [ ] **Sale-derived invoices — blocks the Invoices page.** The FE creates an invoice from
      a sale: `POST /invoices { saleId }`. The backend invoice endpoint instead builds from
      `items[]` and **re-issues stock + re-posts revenue**, so it can't be reused for a sale
      (double counting). Add an endpoint that creates an invoice **from an existing sale**
      (copy its totals/customer, post **no** new stock/ledger entries) and returns the FE
      invoice shape (`id`, `invoiceNumber`, `saleId`, `customerId`, `status`, `issueDate`,
      `subtotal`, `taxTotal`, `discountTotal`, `grandTotal`, `paidAmount`). Make it idempotent
      (return the existing invoice if the sale already has one). `GET /invoices` must expose
      those same FE names (`invoiceNumber`, `issueDate`, `paidAmount`) plus `customer.name`.

- [ ] **Catalog entities.** The FE expects `GET /catalog → { categories, brands, units }`
      and products that reference them by id (`categoryId`, `brandId`, `unitId`). The backend
      stores `category`/`unit` as **free strings** and has **no brands**. Add
      `Category` / `Brand` / `Unit` collections + a real `/catalog`. (Today the adapter fakes
      `/catalog` from the distinct category/unit strings on products, and brands are always
      empty.)

- [ ] **Settings.** The FE uses `GET /settings` and `PUT /settings` with
      `{ companyName, address, phone, email, taxNumber, currency }`. There is no settings
      collection (company info is env-only). Add a singleton settings document + GET/PUT.

- [ ] **File uploads.** Before an online-payment sale, the POS uploads the transfer receipt:
      `POST /uploads` (multipart, field `file`) → `{ url, name, size }`. No endpoint exists,
      so the adapter falls back to a fake URL and the receipt isn't really stored. Add an
      upload endpoint (disk/S3) returning a retrievable `url`.

- [ ] **First-class stock-adjust + a current-stock lookup.** The FE sends
      `{ productId, warehouseId, type, quantity }` where type is one of
      `STOCK_IN` / `STOCK_OUT` / `DAMAGED` / `ADJUSTMENT`, and expects `{ newQty }` back. The
      backend `adjust-stock` needs a signed `delta`
      **and** a unit cost, and returns the product (no `newQty`). The adapter compensates by
      fetching the warehouse's product list to get current on-hand (for the `ADJUSTMENT` delta
      and to compute `newQty`) and valuing `STOCK_IN` at the product's `purchasePrice`.
      Provide an endpoint that accepts `type + quantity (+ optional cost)`, returns
      `{ newQty }`, plus a cheap per-product/warehouse current-stock lookup.

- [ ] **Return full lists (no hard 100 cap).** `parsePagination` caps `limit` at 100, but the
      FE has no pagination UI and expects the full array for the inventory list, the POS/GP
      product pickers, and the stock-adjust lookup. Raise the cap for these screens (or commit
      to the FE-driven search so the cap never bites).

## 2. Behavioral parity the frontend needs (smaller backend tweaks)

- [ ] **Mixed payment must allow change.** The backend rejects a sale unless
      `cash + online == total` exactly, but the POS allows over-tender and shows change.
      Accept the excess as change (cap booked amounts at `total`) instead of erroring.

- [ ] **Purchase payment method/account.** The GP form captures no payment method, so the
      adapter defaults `paid > 0` to **CASH**. To pay a purchase by bank, the backend needs to
      accept a method/account without the GP UI sending one (or default sensibly).

- [ ] **Purchase should update the catalog price.** The mock set `product.purchasePrice` to
      the line rate on receipt; the backend updates only the moving-average `avgCost`, so the
      catalog `purchasePrice` (shown in Products and prefilled in the GP form) never changes.
      Update `purchasePrice` to the last purchase rate on receipt.

- [ ] **Error message shape.** Some FE catches read `error.response.data.message?.[0]`
      (expecting a class-validator **array**); the backend returns `message` as a **string**.
      Align so error toasts read correctly (return an array, or have the FE read `errors`).

## Setup (needed for the frontend to reach the backend)

- `backend/.env`: `CLIENT_URL=http://localhost:5173` (CORS for the Vite app), `PORT=5050`,
  Mongo running. _(Already configured locally.)_
- Seed before first login: `npm run seed:roles && npm run seed:superadmin`. Login uses the
  seeded `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` (not the login form's demo hint).
