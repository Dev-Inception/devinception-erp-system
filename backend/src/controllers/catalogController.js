const catalogService = require('../services/catalogService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

// Catalog entities are serialized with a string `id` (plus `name`, and
// `abbreviation` for units) — the shape the product-form dropdowns consume.
const mapEntry = (e) => ({
  id: String(e._id ?? e.id),
  name: e.name,
  description: e.description || '',
});
const mapUnit = (u) => ({
  id: String(u._id ?? u.id),
  name: u.name,
  unit: u.abbreviation || u.name,
  abbreviation: u.abbreviation || u.name,
});

const getCatalog = asyncHandler(async (_req, res) => {
  const { categories, brands, units } = await catalogService.listCatalog();
  return sendSuccess(res, 200, 'Catalog fetched', {
    categories: categories.map(mapEntry),
    brands: brands.map(mapEntry),
    units: units.map(mapUnit),
  });
});

const createCategory = asyncHandler(async (req, res) => {
  const entry = await catalogService.createEntry('category', req.body);
  return sendSuccess(res, 201, 'Category saved', { category: mapEntry(entry) });
});

const createBrand = asyncHandler(async (req, res) => {
  const entry = await catalogService.createEntry('brand', req.body);
  return sendSuccess(res, 201, 'Brand saved', { brand: mapEntry(entry) });
});

const createUnit = asyncHandler(async (req, res) => {
  const entry = await catalogService.createEntry('unit', {
    ...req.body,
    abbreviation: req.body.unit || req.body.abbreviation,
  });
  return sendSuccess(res, 201, 'Unit saved', { unit: mapUnit(entry) });
});

const listCategories = asyncHandler(async (_req, res) => {
  const entries = await catalogService.listEntries('category');
  return sendSuccess(res, 200, 'Categories fetched', { categories: entries.map(mapEntry) });
});

const getCategory = asyncHandler(async (req, res) => {
  const entry = await catalogService.getEntryById('category', req.params.id);
  return sendSuccess(res, 200, 'Category fetched', { category: mapEntry(entry) });
});

const updateCategory = asyncHandler(async (req, res) => {
  const entry = await catalogService.updateEntry('category', req.params.id, req.body);
  return sendSuccess(res, 200, 'Category updated', { category: mapEntry(entry) });
});

const deleteCategory = asyncHandler(async (req, res) => {
  await catalogService.deleteEntry('category', req.params.id);
  return sendSuccess(res, 200, 'Category deleted');
});

const listUnits = asyncHandler(async (_req, res) => {
  const entries = await catalogService.listEntries('unit');
  return sendSuccess(res, 200, 'Units fetched', { units: entries.map(mapUnit) });
});

const getUnit = asyncHandler(async (req, res) => {
  const entry = await catalogService.getEntryById('unit', req.params.id);
  return sendSuccess(res, 200, 'Unit fetched', { unit: mapUnit(entry) });
});

const updateUnit = asyncHandler(async (req, res) => {
  const entry = await catalogService.updateEntry('unit', req.params.id, req.body);
  return sendSuccess(res, 200, 'Unit updated', { unit: mapUnit(entry) });
});

const deleteUnit = asyncHandler(async (req, res) => {
  await catalogService.deleteEntry('unit', req.params.id);
  return sendSuccess(res, 200, 'Unit deleted');
});

module.exports = {
  getCatalog,
  createCategory,
  createBrand,
  createUnit,
  listCategories,
  getCategory,
  updateCategory,
  deleteCategory,
  listUnits,
  getUnit,
  updateUnit,
  deleteUnit,
};
