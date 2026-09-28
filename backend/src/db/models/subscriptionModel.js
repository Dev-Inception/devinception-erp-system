const { DataTypes } = require('sequelize');
const { id, money, defineModel } = require('./helpers');

const BILLING_CYCLE = { MONTHLY: 'monthly', YEARLY: 'yearly', ONE_TIME: 'one_time' };
const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
};

module.exports = defineSubscription;
module.exports.BILLING_CYCLE = BILLING_CYCLE;
module.exports.SUBSCRIPTION_STATUS = SUBSCRIPTION_STATUS;

// One manually-managed billing record per store — superadmin sells stores
// offline (no payment gateway); this just tracks amount/cycle/status.
function defineSubscription(db) {
  const Subscription = defineModel(
    db,
    'Subscription',
    {
      id: id(),
      store: { type: DataTypes.STRING(24), allowNull: false, unique: true, field: 'store_id' },
      owner: { type: DataTypes.STRING(24), allowNull: false, field: 'owner_user_id' },
      amount: money(),
      billingCycle: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: BILLING_CYCLE.MONTHLY,
        field: 'billing_cycle',
        validate: { isIn: [Object.values(BILLING_CYCLE)] },
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: SUBSCRIPTION_STATUS.ACTIVE,
        validate: { isIn: [Object.values(SUBSCRIPTION_STATUS)] },
      },
      startsAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'starts_at',
      },
      endsAt: { type: DataTypes.DATE, field: 'ends_at' },
      notes: { type: DataTypes.STRING(1000), allowNull: false, defaultValue: '' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'subscriptions' },
  );

  Subscription.BILLING_CYCLE = BILLING_CYCLE;
  Subscription.SUBSCRIPTION_STATUS = SUBSCRIPTION_STATUS;

  return Subscription;
}
