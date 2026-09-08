const { DataTypes } = require('sequelize');
const { createId } = require('../id');

// Root-entity primary key: a 24-char hex id generated app-side, matching the
// Mongo ObjectId shape the rest of the app (validators, frontend) expects.
function id() {
  return { type: DataTypes.STRING(24), primaryKey: true, defaultValue: createId };
}

// Integer paisa. Non-negative by default; pass { signed: true } for columns
// that legitimately go negative (rare — most money fields are magnitudes).
function money(options = {}) {
  const { signed, ...rest } = options;
  return {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
    ...(signed ? {} : { validate: { min: 0 } }),
    ...rest,
  };
}

// Fixed-scale decimal quantity. Six decimal places matches
// utils/quantity.js's QUANTITY_DECIMALS so fractional/weighted units survive
// the round trip through Postgres NUMERIC without drift.
function quantity(options = {}) {
  return {
    type: DataTypes.DECIMAL(20, 6),
    allowNull: false,
    defaultValue: 0,
    ...options,
  };
}

function defineModel(db, name, attributes, options = {}) {
  return db.define(name, attributes, { timestamps: true, underscored: true, ...options });
}

// Makes a model's JSON output look like the Mongoose documents the frontend
// already expects: an `_id` field instead of `id`, and no leaked secrets.
// `transform`, when given, runs last and can reshape flattened columns back
// into the nested object shape the old Mongoose subdocument had (e.g.
// GatePass.driver — see models/index.js's TRANSFORMS map).
function addPublicSerialization(model, hidden = [], transform = null) {
  model.prototype.toJSON = function toJSON() {
    // `{ plain: true }` is required here — without it, Sequelize's `get()`
    // returns loaded associations (e.g. a hasMany fetched via `separate:
    // true`, like Sale.items) as raw Model instances instead of recursively
    // converting them to plain objects. Left as bare `this.get()`, those
    // instances leak their internal Sequelize state (dataValues,
    // _previousDataValues, _changed, ...) into the API response the moment
    // anything downstream spreads them (e.g. `{ ...item }`), instead of the
    // instance's actual columns.
    const values = { ...this.get({ plain: true }) };
    values._id = values.id;
    delete values.id;
    for (const field of hidden) delete values[field];
    return transform ? transform(values) : values;
  };
}

module.exports = { id, money, quantity, defineModel, addPublicSerialization };
