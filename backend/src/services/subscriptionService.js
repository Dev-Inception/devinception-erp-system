const { Op } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/constants');
const { toPaisa } = require('../utils/money');

/**
 * Superadmin-only: sells stores to customers. Provisioning creates the
 * owner (an ADMIN user), one or more Store rows, a store_admins membership
 * row per store (so the owner can administer them — see utils/storeScope.js),
 * and a subscriptions row per store (manual/offline billing — amount,
 * cycle, status; no payment gateway).
 */

const SUBSCRIPTION_INCLUDE = [
  { association: 'storeInfo', attributes: ['id', 'name', 'code'] },
  { association: 'ownerInfo', attributes: ['id', 'name', 'email'] },
];

async function findOrCreateOwner({ ownerName, ownerEmail, ownerPassword }, transaction) {
  const { User } = initializeModels();
  const existing = await User.findOne({ where: { email: ownerEmail }, transaction });
  if (existing) {
    if (existing.role !== ROLES.ADMIN) {
      throw ApiError.conflict('That email belongs to an existing non-admin account');
    }
    return existing;
  }
  if (!ownerPassword) {
    throw ApiError.badRequest('A password is required to create a new owner account');
  }
  return User.create(
    { name: ownerName, email: ownerEmail, password: ownerPassword, role: ROLES.ADMIN, store: null },
    { transaction },
  );
}

async function createStoreWithSubscription(
  { name, ownerId, amount, billingCycle, notes, actor },
  transaction,
) {
  const { Store, StoreAdmin, Subscription } = initializeModels();
  const store = await Store.create({ name, isActive: true }, { transaction });
  await StoreAdmin.create({ userId: ownerId, storeId: store.id }, { transaction });
  const subscription = await Subscription.create(
    {
      store: store.id,
      owner: ownerId,
      amount: toPaisa(amount),
      billingCycle,
      notes: notes || '',
      createdBy: actor ? actor.id : null,
    },
    { transaction },
  );
  return { store, subscription };
}

// Provisions N brand-new stores for a new or existing owner in one go — the
// "customer wants 1/2/N stores" flow.
async function provisionSubscription(
  actor,
  {
    ownerName,
    ownerEmail,
    ownerPassword,
    storeCount,
    storeNames,
    amountPerStore,
    billingCycle,
    notes,
  },
) {
  const count = Number(storeCount) || 0;
  if (count < 1) throw ApiError.badRequest('At least one store is required');

  return getPostgres().transaction(async (transaction) => {
    const owner = await findOrCreateOwner({ ownerName, ownerEmail, ownerPassword }, transaction);

    const stores = [];
    const subscriptions = [];
    for (let i = 0; i < count; i += 1) {
      const name =
        Array.isArray(storeNames) && storeNames[i]
          ? storeNames[i]
          : `${ownerName || owner.name} Store ${i + 1}`;
      const { store, subscription } = await createStoreWithSubscription(
        { name, ownerId: owner.id, amount: amountPerStore, billingCycle, notes, actor },
        transaction,
      );
      stores.push(store);
      subscriptions.push(subscription);
    }

    return { owner, stores, subscriptions };
  });
}

// An existing customer buys another store later.
async function addStoreToOwner(actor, { ownerId, storeName, amount, billingCycle, notes }) {
  const { User } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    const owner = await User.findByPk(ownerId, { transaction });
    if (!owner || owner.role !== ROLES.ADMIN) {
      throw ApiError.badRequest('Owner must be an existing admin account');
    }
    return createStoreWithSubscription(
      { name: storeName, ownerId: owner.id, amount, billingCycle, notes, actor },
      transaction,
    );
  });
}

// Adds a co-owner to an already-provisioned store (its subscription is left
// untouched — this only widens who can administer it).
async function attachExistingStore(actor, { ownerId, storeId }) {
  const { User, Store, StoreAdmin } = initializeModels();
  const [owner, store] = await Promise.all([User.findByPk(ownerId), Store.findByPk(storeId)]);
  if (!owner || owner.role !== ROLES.ADMIN) {
    throw ApiError.badRequest('Owner must be an existing admin account');
  }
  if (!store) throw ApiError.notFound('Store not found');
  const [membership] = await StoreAdmin.findOrCreate({
    where: { userId: owner.id, storeId: store.id },
  });
  return membership;
}

async function listSubscriptions({ page = 1, limit = 20, status, search } = {}) {
  const { Subscription, User } = initializeModels();
  const where = {};
  if (status) where.status = status;

  const include = [...SUBSCRIPTION_INCLUDE];
  if (search) {
    const ownerIds = (
      await User.findAll({
        where: {
          [Op.or]: [
            { name: { [Op.iLike]: `%${search}%` } },
            { email: { [Op.iLike]: `%${search}%` } },
          ],
        },
        attributes: ['id'],
      })
    ).map((u) => u.id);
    where.owner = { [Op.in]: ownerIds.length ? ownerIds : ['__none__'] };
  }

  const pageNum = Math.max(Number(page) || 1, 1);
  const limitNum = Number(limit) || 20;
  const offset = (pageNum - 1) * limitNum;

  const { rows, count } = await Subscription.findAndCountAll({
    where,
    include,
    order: [['createdAt', 'DESC']],
    offset,
    limit: limitNum,
  });

  return { subscriptions: rows, total: count, page: pageNum, limit: limitNum };
}

async function getSubscriptionById(id) {
  const { Subscription } = initializeModels();
  const subscription = await Subscription.findByPk(id, { include: SUBSCRIPTION_INCLUDE });
  if (!subscription) throw ApiError.notFound('Subscription not found');
  return subscription;
}

async function updateSubscription(id, { amount, billingCycle, status, endsAt, notes }) {
  const subscription = await getSubscriptionById(id);
  if (amount !== undefined) subscription.amount = toPaisa(amount);
  if (billingCycle !== undefined) subscription.billingCycle = billingCycle;
  if (status !== undefined) subscription.status = status;
  if (endsAt !== undefined) subscription.endsAt = endsAt;
  if (notes !== undefined) subscription.notes = notes;
  await subscription.save();
  return subscription;
}

// Owner picker for the "attach to existing customer" flow.
async function listOwners({ search } = {}) {
  const { User } = initializeModels();
  const where = { role: ROLES.ADMIN };
  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
    ];
  }
  return User.findAll({
    where,
    include: [{ association: 'adminStores', attributes: ['id', 'name'] }],
    order: [['name', 'ASC']],
  });
}

module.exports = {
  provisionSubscription,
  addStoreToOwner,
  attachExistingStore,
  listSubscriptions,
  getSubscriptionById,
  updateSubscription,
  listOwners,
};
