const Labour = require('../models/labourModel');
const ApiError = require('../utils/ApiError');
const { parsePagination } = require('../utils/query');

async function listLabour(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const [labour, total] = await Promise.all([
    Labour.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    Labour.countDocuments(),
  ]);
  return { labour, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function getLabourById(id) {
  const labour = await Labour.findById(id);
  if (!labour) throw ApiError.notFound('Labour not found');
  return labour;
}

async function createLabour({ name, phoneNumber }) {
  // Check for duplicate phone number
  const existing = await Labour.findOne({ phoneNumber });
  if (existing) throw ApiError.conflict('Labour with this phone number already exists');

  const labour = await Labour.create({ name, phoneNumber });
  return labour;
}

async function updateLabour(id, { name, phoneNumber }) {
  const labour = await getLabourById(id);

  // Check if phone number is being changed and already exists
  if (phoneNumber && phoneNumber !== labour.phoneNumber) {
    const existing = await Labour.findOne({ phoneNumber });
    if (existing) throw ApiError.conflict('Labour with this phone number already exists');
    labour.phoneNumber = phoneNumber;
  }

  if (name) labour.name = name;

  await labour.save();
  return labour;
}

async function deleteLabour(id) {
  const labour = await getLabourById(id);
  await labour.deleteOne();
  return labour;
}

module.exports = {
  listLabour,
  getLabourById,
  createLabour,
  updateLabour,
  deleteLabour,
};
