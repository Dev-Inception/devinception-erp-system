const { Op, fn, col, where: sqlWhere, UniqueConstraintError } = require('sequelize');
const { initializeModels } = require('../db/models');
const { isValidId } = require('../db/id');
const ApiError = require('../utils/ApiError');
const {
  resolveStoreScope,
  storeWhere,
  requireWriteStore,
  assertStoreAccess,
} = require('../utils/storeScope');

/**
 * The product catalog's classification entities — categories, brands and units
 * of measure. Each belongs to one store (nullable: rows created before
 * multi-tenancy existed stay "legacy", visible only to an unrestricted actor
 * — see utils/storeScope.js) — a new store starts with none of its own,
 * same as every other per-store entity. Products reference these by id.
 * Helpers here also resolve a product's catalog refs from either an
 * explicit id or a free-text name (find-or-create), so both the id-based
 * payloads and legacy name strings work.
 */

function kindModel() {
  const { Category, Brand, Unit } = initializeModels();
  return { category: Category, brand: Brand, unit: Unit };
}

// Case-insensitive equality fragment for a `name` column, matching the
// `(store_id, LOWER(name))` unique indexes on categories/brands/units.
function nameEquals(value) {
  return sqlWhere(fn('LOWER', col('name')), value.toLowerCase());
}

// Everything the catalog screen / product-form dropdowns need, active only,
// scoped to the actor's own store(s) (or every store, for an unrestricted
// actor with no explicit `store` — an unrestricted actor who *does* pass one
// narrows too, e.g. super admin viewing "as" one store from the header
// switcher).
async function listCatalog(actor, store) {
  const { Category, Brand, Unit } = initializeModels();
  const { storeIds } = await resolveStoreScope({ store, actor });
  const where = { ...storeWhere(storeIds), isActive: true };
  const [categories, brands, units] = await Promise.all([
    Category.findAll({ where, order: [['name', 'ASC']] }),
    Brand.findAll({ where, order: [['name', 'ASC']] }),
    Unit.findAll({ where, order: [['name', 'ASC']] }),
  ]);
  return { categories, brands, units };
}

// Case-insensitive find-or-create by name, scoped to one store. `extra`
// carries any non-name fields (e.g. a unit's abbreviation) used only when
// the entity is created.
async function findOrCreateByName(Model, name, storeId, extra = {}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const where = { store: storeId, [Op.and]: [nameEquals(trimmed)] };
  const existing = await Model.findOne({ where });
  if (existing) return existing;
  try {
    return await Model.create({ name: trimmed, store: storeId, ...extra });
  } catch (err) {
    // Lost a create race against the unique index — fetch the winner.
    if (err instanceof UniqueConstraintError) {
      return Model.findOne({ where });
    }
    throw err;
  }
}

/**
 * Resolve a single catalog reference. Prefers an explicit `id`; falls back to a
 * free-text `name` (find-or-create, in `storeId`). Returns the entity's id,
 * `null` to clear the ref (explicit empty/null), or `undefined` to leave it
 * unchanged. An explicit id must belong to the actor's own store(s) — never
 * lets a product borrow another tenant's (or legacy, null-store) category.
 */
async function resolveRef(Model, id, name, actor, storeId, extra) {
  if (id !== undefined && id !== null && id !== '') {
    if (!isValidId(id)) {
      throw ApiError.badRequest(`Invalid ${Model.name.toLowerCase()} id`);
    }
    const doc = await Model.findByPk(id);
    if (!doc) throw ApiError.notFound(`${Model.name} not found`);
    assertStoreAccess(actor, doc.store);
    return doc.id;
  }
  if (typeof name === 'string' && name.trim()) {
    const doc = await findOrCreateByName(Model, name, storeId, extra);
    return doc ? doc.id : null;
  }
  if (id === null || id === '' || name === null || name === '') return null;
  return undefined;
}

// True when an id/name pair would take the free-text (find-or-create) path.
function isFreeTextRef(id, name) {
  return (
    (id === undefined || id === null || id === '') && typeof name === 'string' && !!name.trim()
  );
}

/**
 * Map a product payload's catalog fields to `{ category, brand, unit }` ids.
 * Accepts either id fields (`categoryId`/`brandId`/`unitId`) or legacy name
 * strings (`category`/`unit`/`brand`). Keys are present only when supplied, so
 * an update leaves unspecified refs untouched. A free-text name is created
 * under the actor's own store (or `data.store`, for a multi-store admin) —
 * that store is only required when a name actually needs creating, so
 * editing a product by existing catalog ids never forces a store pick.
 */
async function resolveProductRefs(data = {}, actor) {
  const { Category, Brand, Unit } = initializeModels();
  const needsStore =
    isFreeTextRef(data.categoryId, data.category) ||
    isFreeTextRef(data.brandId, data.brand) ||
    isFreeTextRef(data.unitId, data.unit);
  const storeId = needsStore ? requireWriteStore(actor, data.store) : undefined;

  const refs = {};
  const category = await resolveRef(Category, data.categoryId, data.category, actor, storeId);
  const brand = await resolveRef(Brand, data.brandId, data.brand, actor, storeId);
  const unit = await resolveRef(Unit, data.unitId, data.unit, actor, storeId, {
    abbreviation: typeof data.unit === 'string' ? data.unit.trim() : '',
  });
  if (category !== undefined) refs.category = category;
  if (brand !== undefined) refs.brand = brand;
  if (unit !== undefined) refs.unit = unit;
  return refs;
}

// Create (or return existing) a catalog entry of the given kind, under the
// actor's own store (or an explicit one, for a multi-store admin).
async function createEntry(kind, actor, { name, description, abbreviation, unit, store } = {}) {
  const Model = kindModel()[kind];
  if (!Model) throw ApiError.badRequest('Unknown catalog type');
  if (!name || !String(name).trim()) throw ApiError.badRequest('A name is required');
  const storeId = requireWriteStore(actor, store);
  let extra = {};
  if (kind === 'unit') extra = { abbreviation: String(unit || abbreviation || '').trim() };
  if (kind === 'category') extra = { description: String(description || '').trim() };
  return findOrCreateByName(Model, name, storeId, extra);
}

function modelFor(kind) {
  const Model = kindModel()[kind];
  if (!Model) throw ApiError.badRequest('Unknown catalog type');
  return Model;
}

async function listEntries(kind, actor, store) {
  const { storeIds } = await resolveStoreScope({ store, actor });
  const where = { ...storeWhere(storeIds), isActive: true };
  return modelFor(kind).findAll({ where, order: [['name', 'ASC']] });
}

async function getEntryById(kind, actor, id) {
  const entry = await modelFor(kind).findByPk(id);
  if (!entry) throw ApiError.notFound(`${kind === 'unit' ? 'Unit' : 'Category'} not found`);
  assertStoreAccess(actor, entry.store);
  return entry;
}

async function updateEntry(kind, actor, id, data = {}) {
  const entry = await getEntryById(kind, actor, id);
  if (data.name !== undefined) entry.name = data.name;
  if (kind === 'category' && data.description !== undefined) {
    entry.description = data.description;
  }
  if (kind === 'unit') {
    const abbreviation = data.unit !== undefined ? data.unit : data.abbreviation;
    if (abbreviation !== undefined) entry.abbreviation = abbreviation;
  }
  await entry.save();
  return entry;
}

async function deleteEntry(kind, actor, id) {
  const { Product } = initializeModels();
  const entry = await getEntryById(kind, actor, id);
  const productField = kind === 'unit' ? 'unit' : 'category';
  const inUse = await Product.count({ where: { [productField]: entry.id } });
  if (inUse > 0) {
    throw ApiError.badRequest(
      `${kind === 'unit' ? 'Unit' : 'Category'} is used by products and cannot be deleted`,
    );
  }
  await entry.destroy();
}

module.exports = {
  listCatalog,
  findOrCreateByName,
  resolveRef,
  resolveProductRefs,
  createEntry,
  listEntries,
  getEntryById,
  updateEntry,
  deleteEntry,
};
