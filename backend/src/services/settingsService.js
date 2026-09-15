const { UniqueConstraintError } = require('sequelize');
const { initializeModels } = require('../db/models');
const { resolveOptionalWriteStore } = require('../utils/storeScope');
const env = require('../config/env');

/**
 * Company info (name, address, currency, invoice note) that appears on every
 * receipt/invoice — one row per store, so two tenants never see or overwrite
 * each other's identity. `key = 'app'` is the original singleton row, kept
 * as the legacy/super-admin default (store IS NULL); every per-store row
 * reuses that same `key` uniqueness by setting `key` to the store's own id
 * (already guaranteed unique), so no new constraint is needed.
 *
 * Only a super_admin can ever read/write the global row (resolveOptionalWriteStore
 * only resolves to `null` for an unrestricted actor with no explicit store —
 * every other role is confined to their own store). A store row that hasn't
 * set one of FALLBACK_FIELDS itself (blank/empty) shows the super_admin's
 * global value instead — see getSettings — so a store owner only needs to
 * fill in what they want to override.
 */

function defaults() {
  return {
    companyName: env.company.name || '',
    address: env.company.address || '',
    phone: env.company.phone || '',
    email: '',
    taxNumber: '',
    currency: 'PKR',
    invoiceNote: '',
  };
}

async function findOrCreateSettings(targetStore) {
  const { Settings } = initializeModels();
  let settings = await Settings.findOne({ where: { store: targetStore } });
  if (settings) return settings;
  try {
    settings = await Settings.create({
      key: targetStore || 'app',
      store: targetStore,
      ...defaults(),
    });
    return settings;
  } catch (err) {
    // Concurrent first-read created it first — fetch the winner.
    if (err instanceof UniqueConstraintError) {
      return Settings.findOne({ where: { store: targetStore } });
    }
    throw err;
  }
}

// Fields a store can inherit from the super-admin's global (store IS NULL)
// row when it hasn't set its own — company identity/branding only, nothing
// transactional.
const FALLBACK_FIELDS = [
  'companyName',
  'address',
  'phone',
  'email',
  'taxNumber',
  'currency',
  'invoiceNote',
  'logoUrl',
  'facebook',
  'instagram',
  'gmail',
  'tiktok',
  'website',
];

async function getSettings({ store, actor } = {}) {
  const targetStore = resolveOptionalWriteStore(actor, store);
  const settings = await findOrCreateSettings(targetStore);
  // The global row itself has nothing to fall back to.
  if (!targetStore) return settings;

  const globalSettings = await findOrCreateSettings(null);
  const merged = settings.toJSON();
  for (const k of FALLBACK_FIELDS) {
    if (!merged[k]) merged[k] = globalSettings[k];
  }
  return merged;
}

const WRITABLE = [
  'companyName',
  'address',
  'phone',
  'email',
  'taxNumber',
  'currency',
  'invoiceNote',
  'logoUrl',
  'facebook',
  'instagram',
  'gmail',
  'tiktok',
  'website',
];

async function updateSettings({ store, actor } = {}, data = {}) {
  const targetStore = resolveOptionalWriteStore(actor, store);
  const settings = await findOrCreateSettings(targetStore);
  for (const k of WRITABLE) if (data[k] !== undefined) settings[k] = data[k];
  await settings.save();
  return settings;
}

module.exports = { getSettings, updateSettings };
