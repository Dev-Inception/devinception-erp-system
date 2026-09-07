const { DataTypes } = require('sequelize');
const { createId } = require('../id');

const id = () => ({
  type: DataTypes.STRING(24),
  primaryKey: true,
  defaultValue: createId,
});

const money = (options = {}) => ({
  type: DataTypes.BIGINT,
  allowNull: false,
  defaultValue: 0,
  validate: options.signed ? {} : { min: 0 },
  ...options,
});

const quantity = (options = {}) => ({
  type: DataTypes.DECIMAL(20, 6),
  allowNull: false,
  defaultValue: 0,
  ...options,
});

function defineModel(db, name, attributes, options = {}) {
  return db.define(name, attributes, {
    timestamps: true,
    underscored: true,
    ...options,
  });
}

function addPublicSerialization(model, hidden = []) {
  Object.defineProperty(model.prototype, '_id', {
    configurable: true,
    get() {
      return this.getDataValue('id');
    },
  });

  model.prototype.toJSON = function toJSON() {
    const values = { ...this.get() };
    values._id = values.id;
    delete values.id;
    for (const field of hidden) delete values[field];
    return values;
  };
}

module.exports = { DataTypes, id, money, quantity, defineModel, addPublicSerialization };
