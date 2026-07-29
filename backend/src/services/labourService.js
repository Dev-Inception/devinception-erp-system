const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { Labour } = initializeModels();

async function listLabour() {
  return Labour.findAll({ order: [['createdAt', 'DESC']] });
}

async function getLabourById(id) {
  const labour = await Labour.findByPk(id);
  if (!labour) throw ApiError.notFound('Labour not found');
  return labour;
}

async function createLabour({ name, phoneNumber }) {
  // Check for duplicate phone number
  const existing = await Labour.findOne({ where: { phoneNumber } });
  if (existing) throw ApiError.conflict('Labour with this phone number already exists');

  const labour = await Labour.create({ name, phoneNumber });
  return labour;
}

async function updateLabour(id, { name, phoneNumber }) {
  const labour = await getLabourById(id);

  // Check if phone number is being changed and already exists
  if (phoneNumber && phoneNumber !== labour.phoneNumber) {
    const existing = await Labour.findOne({ where: { phoneNumber } });
    if (existing) throw ApiError.conflict('Labour with this phone number already exists');
    labour.phoneNumber = phoneNumber;
  }

  if (name) labour.name = name;

  await labour.save();
  return labour;
}

async function deleteLabour(id) {
  const labour = await getLabourById(id);
  await labour.destroy();
  return labour;
}

module.exports = {
  listLabour,
  getLabourById,
  createLabour,
  updateLabour,
  deleteLabour,
};
