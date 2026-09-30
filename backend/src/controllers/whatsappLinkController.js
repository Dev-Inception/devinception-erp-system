const whatsappLinkService = require('../services/whatsappLinkService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { resolveOptionalWriteStore } = require('../utils/storeScope');

/**
 * Linking a store's WhatsApp number (Settings → Notifications). Same store
 * resolution as Settings itself: a store user always acts on their own
 * store, a super admin with no store selected on the global fallback link.
 */

const storeOf = (req) => resolveOptionalWriteStore(req.user, req.query.store);

const getStatus = asyncHandler(async (req, res) =>
  sendSuccess(res, 200, 'WhatsApp link status', whatsappLinkService.getStatus(storeOf(req))),
);

const connect = asyncHandler(async (req, res) =>
  sendSuccess(res, 200, 'Linking started', await whatsappLinkService.connect(storeOf(req))),
);

const unlink = asyncHandler(async (req, res) => {
  await whatsappLinkService.unlink(storeOf(req));
  return sendSuccess(res, 200, 'WhatsApp unlinked', { status: 'closed' });
});

module.exports = { getStatus, connect, unlink };
