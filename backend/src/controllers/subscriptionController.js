const subscriptionService = require('../services/subscriptionService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

const out = (s) => (s && s.toJSON ? s.toJSON() : s);
const serialize = (subscription) => view(out(subscription), ['amount']);

const listSubscriptions = asyncHandler(async (req, res) => {
  const { page, limit, status, search } = req.query;
  const result = await subscriptionService.listSubscriptions({ page, limit, status, search });
  return sendSuccess(res, 200, 'Subscriptions fetched', {
    ...result,
    subscriptions: result.subscriptions.map(serialize),
  });
});

const provision = asyncHandler(async (req, res) => {
  const result = await subscriptionService.provisionSubscription(req.user, req.body);
  return sendSuccess(res, 201, 'Subscription provisioned', {
    owner: result.owner,
    stores: result.stores,
    subscriptions: result.subscriptions.map(serialize),
  });
});

const addStoreToOwner = asyncHandler(async (req, res) => {
  const { store, subscription } = await subscriptionService.addStoreToOwner(req.user, {
    ownerId: req.params.ownerId,
    ...req.body,
  });
  return sendSuccess(res, 201, 'Store added', { store, subscription: serialize(subscription) });
});

const attachExistingStore = asyncHandler(async (req, res) => {
  await subscriptionService.attachExistingStore(req.user, {
    ownerId: req.params.ownerId,
    storeId: req.body.storeId,
  });
  return sendSuccess(res, 200, 'Store attached to owner');
});

const updateSubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.updateSubscription(req.params.id, req.body);
  return sendSuccess(res, 200, 'Subscription updated', { subscription: serialize(subscription) });
});

const listOwners = asyncHandler(async (req, res) => {
  const owners = await subscriptionService.listOwners({ search: req.query.search });
  return sendSuccess(res, 200, 'Owners fetched', { owners });
});

module.exports = {
  listSubscriptions,
  provision,
  addStoreToOwner,
  attachExistingStore,
  updateSubscription,
  listOwners,
};
