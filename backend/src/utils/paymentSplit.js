const ApiError = require('./ApiError');
const { toPaisa } = require('./money');
const { PAYMENT_METHOD, BANK_METHODS } = require('./finance');

// Work out the cash / online / credit split (paisa) for a chosen payment
// method against a document total. Shared by any flow that settles a
// document the same way a POS sale does (currently saleService and
// vendorSaleService).
function resolveSettlement({ method, total, cashReceived, onlineReceived }) {
  let cash = 0;
  let online = 0;

  if (method === PAYMENT_METHOD.CASH) {
    cash = total;
  } else if (BANK_METHODS.has(method)) {
    online = total;
  } else if (method === PAYMENT_METHOD.MIXED) {
    cash = toPaisa(cashReceived || 0);
    online = toPaisa(onlineReceived || 0);
    // "Mixed" mode splits the full total across cash + online and has no
    // on-account remainder, but it allows over-tender (and shows change).
    // Reject a short tender; treat any excess as change by capping the
    // booked amounts at the total (online first, then cash — the drawer
    // gives change from cash), instead of erroring on an exact-match
    // mismatch.
    if (cash + online < total) {
      throw ApiError.badRequest('Mixed payment: cash + online must cover the total');
    }
    online = Math.min(online, total);
    cash = total - online;
  } else if (method === PAYMENT_METHOD.CREDIT) {
    // entirely on account
  } else {
    throw ApiError.badRequest('Unsupported payment method');
  }

  if (cash < 0 || online < 0) throw ApiError.badRequest('Payment amounts cannot be negative');
  const credit = total - cash - online;
  if (credit < 0) throw ApiError.badRequest('Amount tendered exceeds the total');
  return { cash, online, credit };
}

module.exports = { resolveSettlement };
