const stockReceiptService = require('../services/stockReceiptService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const out = (r) => (r && r.toJSON ? r.toJSON() : r);

const createReceipt = asyncHandler(async (req, res) => {
  const receipt = await stockReceiptService.createReceipt(req.user, req.body);
  return sendSuccess(res, 201, 'Stock receipt recorded', { receipt: out(receipt) });
});

const updateReceipt = asyncHandler(async (req, res) => {
  const receipt = await stockReceiptService.updateReceipt(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, 'Stock receipt updated', { receipt: out(receipt) });
});

const deleteReceipt = asyncHandler(async (req, res) => {
  await stockReceiptService.deleteReceipt(req.user, req.params.id);
  return sendSuccess(res, 200, 'Stock receipt deleted', {});
});

const listReceipts = asyncHandler(async (req, res) => {
  const { page, limit, vendor, warehouse, store, from, to, search } = req.query;
  const result = await stockReceiptService.listReceipts({
    page,
    limit,
    vendor,
    warehouse,
    store,
    from,
    to,
    search,
    actor: req.user,
  });
  return sendSuccess(res, 200, 'Stock receipts fetched', {
    ...result,
    receipts: result.receipts.map(out),
  });
});

module.exports = { createReceipt, updateReceipt, deleteReceipt, listReceipts };
