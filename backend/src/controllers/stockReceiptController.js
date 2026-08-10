const stockReceiptService = require('../services/stockReceiptService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const out = (r) => (r && r.toJSON ? r.toJSON() : r);

const createReceipt = asyncHandler(async (req, res) => {
  const receipt = await stockReceiptService.createReceipt(req.user, req.body);
  return sendSuccess(res, 201, 'Stock receipt recorded', { receipt: out(receipt) });
});

const listReceipts = asyncHandler(async (req, res) => {
  const { page, limit, vendor, warehouse, from, to, search } = req.query;
  const result = await stockReceiptService.listReceipts({
    page,
    limit,
    vendor,
    warehouse,
    from,
    to,
    search,
  });
  return sendSuccess(res, 200, 'Stock receipts fetched', {
    ...result,
    receipts: result.receipts.map(out),
  });
});

module.exports = { createReceipt, listReceipts };
