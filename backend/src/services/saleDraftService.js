const mongoose = require('mongoose');
const SaleDraft = require('../models/saleDraftModel');
const ApiError = require('../utils/ApiError');

async function listDrafts(actor, store) {
  const filter = { createdBy: actor._id };
  if (store && mongoose.isValidObjectId(store)) filter.store = store;
  return SaleDraft.find(filter).sort({ updatedAt: -1 });
}

async function getOwnedDraft(actor, id) {
  const draft = await SaleDraft.findById(id);
  if (!draft || String(draft.createdBy) !== String(actor._id)) {
    throw ApiError.notFound('Draft not found');
  }
  return draft;
}

// Whitelist so a client can never smuggle `createdBy` or other fields in.
function pickFields(body) {
  const fields = {};
  if (body.store !== undefined) fields.store = body.store;
  if (body.step !== undefined) fields.step = body.step;
  if (body.customer !== undefined) fields.customer = body.customer;
  if (body.items !== undefined) fields.items = body.items;
  if (body.labour !== undefined) fields.labour = body.labour;
  if (body.driver !== undefined) fields.driver = body.driver;
  if (body.transportFare !== undefined) fields.transportFare = body.transportFare;
  if (body.discountValue !== undefined) fields.discountValue = body.discountValue;
  if (body.discountType !== undefined) fields.discountType = body.discountType;
  if (body.taxPct !== undefined) fields.taxPct = body.taxPct;
  if (body.advanceAmount !== undefined) fields.advanceAmount = body.advanceAmount;
  return fields;
}

async function createDraft(actor, body) {
  return SaleDraft.create({ createdBy: actor._id, ...pickFields(body) });
}

async function updateDraft(actor, id, body) {
  const draft = await getOwnedDraft(actor, id);
  Object.assign(draft, pickFields(body));
  await draft.save();
  return draft;
}

async function deleteDraft(actor, id) {
  const draft = await getOwnedDraft(actor, id);
  await draft.deleteOne();
}

module.exports = { listDrafts, getOwnedDraft, createDraft, updateDraft, deleteDraft };
