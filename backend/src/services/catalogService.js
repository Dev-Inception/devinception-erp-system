const mongoose = require('mongoose');
const Category = require('../models/categoryModel');
const Brand = require('../models/brandModel');
const Unit = require('../models/unitModel');
const ApiError = require('../utils/ApiError');
const { escapeRegex } = require('../utils/query');

/**
 * The product catalog's classification entities — categories, brands and units
 * of measure. Products reference these by id. Helpers here also resolve a
 * product's catalog refs from either an explicit id or a free-text name
 * (find-or-create), so both the id-based payloads and legacy name strings work.
 */

const KIND_MODEL = { category: Category, brand: Brand, unit: Unit };

// Everything the catalog screen / product-form dropdowns need, active only.
async function listCatalog() {
  const [categories, brands, units] = await Promise.all([
    Category.find({ isActive: true }).sort({ name: 1 }).lean(),
    Brand.find({ isActive: true }).sort({ name: 1 }).lean(),
    Unit.find({ isActive: true }).sort({ name: 1 }).lean(),
  ]);
  return { categories, brands, units };
}

// Case-insensitive find-or-create by name. `extra` carries any non-name fields
// (e.g. a unit's abbreviation) used only when the entity is created.
async function findOrCreateByName(Model, name, extra = {}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const existing = await Model.findOne({
    name: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' },
  });
  if (existing) return existing;
  try {
    return await Model.create({ name: trimmed, ...extra });
  } catch (err) {
    // Lost a create race against the unique index — fetch the winner.
    if (err && err.code === 11000) {
      return Model.findOne({ name: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' } });
    }
    throw err;
  }
}

/**
 * Resolve a single catalog reference. Prefers an explicit `id`; falls back to a
 * free-text `name` (find-or-create). Returns the entity's `_id`, `null` to
 * clear the ref (explicit empty/null), or `undefined` to leave it unchanged.
 */
async function resolveRef(Model, id, name, extra) {
  if (id !== undefined && id !== null && id !== '') {
    if (!mongoose.isValidObjectId(id)) {
      throw ApiError.badRequest(`Invalid ${Model.modelName.toLowerCase()} id`);
    }
    const doc = await Model.findById(id);
    if (!doc) throw ApiError.notFound(`${Model.modelName} not found`);
    return doc._id;
  }
  if (typeof name === 'string' && name.trim()) {
    const doc = await findOrCreateByName(Model, name, extra);
    return doc ? doc._id : null;
  }
  if (id === null || id === '' || name === null || name === '') return null;
  return undefined;
}

/**
 * Map a product payload's catalog fields to `{ category, brand, unit }` ids.
 * Accepts either id fields (`categoryId`/`brandId`/`unitId`) or legacy name
 * strings (`category`/`unit`/`brand`). Keys are present only when supplied, so
 * an update leaves unspecified refs untouched.
 */
async function resolveProductRefs(data = {}) {
  const refs = {};
  const category = await resolveRef(Category, data.categoryId, data.category);
  const brand = await resolveRef(Brand, data.brandId, data.brand);
  const unit = await resolveRef(Unit, data.unitId, data.unit, {
    abbreviation: typeof data.unit === 'string' ? data.unit.trim() : '',
  });
  if (category !== undefined) refs.category = category;
  if (brand !== undefined) refs.brand = brand;
  if (unit !== undefined) refs.unit = unit;
  return refs;
}

// Create (or return existing) a catalog entry of the given kind.
async function createEntry(kind, { name, abbreviation } = {}) {
  const Model = KIND_MODEL[kind];
  if (!Model) throw ApiError.badRequest('Unknown catalog type');
  if (!name || !String(name).trim()) throw ApiError.badRequest('A name is required');
  const extra = kind === 'unit' ? { abbreviation: (abbreviation || '').trim() } : {};
  return findOrCreateByName(Model, name, extra);
}

module.exports = { listCatalog, findOrCreateByName, resolveRef, resolveProductRefs, createEntry };
