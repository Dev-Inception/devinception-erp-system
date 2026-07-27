const { initializeModels } = require('../db/models');
const env = require('../config/env');
const { Settings } = initializeModels();

/**
 * The singleton settings document. `getSettings` lazily creates it on first
 * read, seeded from the env company info so a fresh install still has sensible
 * values. Writes only touch the known fields.
 */

const KEY = 'app';

function defaults() {
  return {
    companyName: env.company.name || '',
    address: env.company.address || '',
    phone: env.company.phone || '',
    email: '',
    taxNumber: '',
    currency: 'PKR',
  };
}

async function getSettings() {
  let settings = await Settings.findOne({ where: { key: KEY } });
  if (settings) return settings;
  try {
    settings = await Settings.create({ key: KEY, ...defaults() });
    return settings;
  } catch (err) {
    // Concurrent first-read created it first — fetch the winner.
    if (err && err.name === 'SequelizeUniqueConstraintError') {
      return Settings.findOne({ where: { key: KEY } });
    }
    throw err;
  }
}

const WRITABLE = ['companyName', 'address', 'phone', 'email', 'taxNumber', 'currency'];

async function updateSettings(data = {}) {
  const settings = await getSettings();
  for (const k of WRITABLE) if (data[k] !== undefined) settings[k] = data[k];
  await settings.save();
  return settings;
}

module.exports = { getSettings, updateSettings };
