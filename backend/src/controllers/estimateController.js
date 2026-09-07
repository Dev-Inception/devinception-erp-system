const estimateService = require('../services/estimateService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

const out = (e) => (e && e.toJSON ? e.toJSON() : e);
function serialize(estimate) {
  const e = view(out(estimate), ['subtotal', 'discount', 'tax', 'total']);
  if (Array.isArray(e.items)) {
    e.items = e.items.map((it) => view(it, ['unitPrice', 'lineTotal']));
  }
  return e;
}

const createEstimate = asyncHandler(async (req, res) => {
  const estimate = await estimateService.createEstimate(req.user, req.body);
  return sendSuccess(res, 201, 'Estimate created', { estimate: serialize(estimate) });
});

const getEstimate = asyncHandler(async (req, res) => {
  const estimate = await estimateService.getEstimateById(req.user, req.params.id);
  return sendSuccess(res, 200, 'Estimate fetched', { estimate: serialize(estimate) });
});

const updateEstimate = asyncHandler(async (req, res) => {
  const estimate = await estimateService.updateEstimate(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, 'Estimate updated', { estimate: serialize(estimate) });
});

const addFollowUp = asyncHandler(async (req, res) => {
  const estimate = await estimateService.addFollowUp(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, 'Follow-up logged', { estimate: serialize(estimate) });
});

const markLost = asyncHandler(async (req, res) => {
  const estimate = await estimateService.markLost(req.user, req.params.id, req.body.reason);
  return sendSuccess(res, 200, 'Estimate marked lost', { estimate: serialize(estimate) });
});

const deleteEstimate = asyncHandler(async (req, res) => {
  await estimateService.deleteEstimate(req.user, req.params.id);
  return sendSuccess(res, 200, 'Estimate deleted');
});

const listEstimates = asyncHandler(async (req, res) => {
  const { page, limit, status, search, from, to, store, dueForFollowUp } = req.query;
  const result = await estimateService.listEstimates({
    page,
    limit,
    status,
    search,
    from,
    to,
    store,
    dueForFollowUp,
    actor: req.user,
  });
  return sendSuccess(res, 200, 'Estimates fetched', {
    ...result,
    estimates: result.estimates.map(serialize),
  });
});

module.exports = {
  createEstimate,
  getEstimate,
  updateEstimate,
  addFollowUp,
  markLost,
  deleteEstimate,
  listEstimates,
};
