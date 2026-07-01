const catalogService = require('../services/catalogService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

// Catalog entities are serialized with a string `id` (plus `name`, and
// `abbreviation` for units) — the shape the product-form dropdowns consume.
const mapEntry = (e) => ({ id: String(e._id ?? e.id), name: e.name });
const mapUnit = (u) => ({
  id: String(u._id ?? u.id),
  name: u.name,
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
  const entry = await catalogService.createEntry('unit', req.body);
  return sendSuccess(res, 201, 'Unit saved', { unit: mapUnit(entry) });
});

module.exports = { getCatalog, createCategory, createBrand, createUnit };
