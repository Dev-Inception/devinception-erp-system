const saleDraftService = require('../services/saleDraftService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const listSaleDrafts = asyncHandler(async (req, res) => {
  const drafts = await saleDraftService.listDrafts(req.user);
  return sendSuccess(res, 200, 'Drafts fetched', { drafts });
});

const createSaleDraft = asyncHandler(async (req, res) => {
  const draft = await saleDraftService.createDraft(req.user, req.body);
  return sendSuccess(res, 201, 'Draft saved', { draft });
});

const updateSaleDraft = asyncHandler(async (req, res) => {
  const draft = await saleDraftService.updateDraft(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, 'Draft saved', { draft });
});

const deleteSaleDraft = asyncHandler(async (req, res) => {
  await saleDraftService.deleteDraft(req.user, req.params.id);
  return sendSuccess(res, 200, 'Draft removed', { success: true });
});

module.exports = { listSaleDrafts, createSaleDraft, updateSaleDraft, deleteSaleDraft };
