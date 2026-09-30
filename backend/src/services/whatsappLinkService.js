const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const pino = require('pino');
const ApiError = require('../utils/ApiError');

/**
 * WhatsApp through a linked personal/business number — the same "Linked
 * devices" pairing WhatsApp Web uses, driven by Baileys (an unofficial
 * WhatsApp Web client). Each store links its own number by scanning a QR
 * code in Settings; the super-admin's global link (key `global`) is the
 * fallback for stores without one, like every other notification setting.
 *
 * Unofficial: WhatsApp can ban a number it thinks is automated, and a
 * WhatsApp Web protocol change can break sending until Baileys is updated.
 * Meta's Cloud API (whatsappService) remains the supported alternative.
 *
 * Sessions are credentials: they live on disk (WHATSAPP_SESSIONS_DIR,
 * default backend/storage/whatsapp-sessions, git-ignored) so a restart
 * reconnects without rescanning, and must survive redeploys. Sockets live
 * in this process, so the backend must run as a single instance — two
 * processes on one session keep kicking each other off (connectionReplaced).
 */

const SESSIONS_DIR =
  process.env.WHATSAPP_SESSIONS_DIR ||
  path.join(__dirname, '..', '..', 'storage', 'whatsapp-sessions');

const GLOBAL_KEY = 'global';
const MAX_RECONNECT_DELAY_MS = 60_000;

const logger = pino({ level: 'silent' });

// Baileys 7 is ESM-only; load it once, lazily, from this CommonJS backend.
let baileysPromise;
function loadBaileys() {
  baileysPromise ??= import('baileys');
  return baileysPromise;
}

/**
 * key -> { sock, status, qr, phone, name, error, retries, timer }
 * status: 'connecting' | 'qr' | 'open' | 'closed'
 */
const sessions = new Map();

const keyFor = (store) => (store ? String(store) : GLOBAL_KEY);
const dirFor = (key) => path.join(SESSIONS_DIR, key);

// A session counts as linked once pairing wrote the account (`me`) into its
// creds — a folder left behind by an unscanned QR has creds but no `me`.
// Returns null when creds.json can't be read (missing, or caught mid-write),
// so callers never mistake an unreadable session for an unlinked one.
function readPaired(key) {
  try {
    const creds = JSON.parse(fs.readFileSync(path.join(dirFor(key), 'creds.json'), 'utf8'));
    return !!creds.me;
  } catch {
    return null;
  }
}
const isPaired = (key) => readPaired(key) === true;

function removeSessionFiles(key) {
  fs.rmSync(dirFor(key), { recursive: true, force: true });
}

function stopSocket(session) {
  clearTimeout(session.timer);
  session.timer = undefined;
  if (session.sock) {
    session.sock.ev.removeAllListeners();
    try {
      session.sock.end(undefined);
    } catch {
      // Already closed.
    }
    session.sock = undefined;
  }
}

async function startSocket(key) {
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers,
    jidNormalizedUser,
  } = await loadBaileys();

  const session = sessions.get(key) ?? { retries: 0 };
  sessions.set(key, session);
  stopSocket(session);
  Object.assign(session, { status: 'connecting', qr: undefined, error: undefined });

  fs.mkdirSync(dirFor(key), { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dirFor(key));
  // Use the current WhatsApp Web version when reachable — an outdated one is
  // the most common reason WhatsApp refuses the connection.
  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    // Fall back to the version bundled with Baileys.
  }

  const sock = makeWASocket({
    ...(version && { version }),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    browser: Browsers.appropriate('Chrome'),
    // Stay "offline" so the phone keeps getting its own notifications, and
    // skip history sync — this link only ever sends.
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  session.sock = sock;

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (session.sock !== sock) return; // superseded by a newer socket

    if (qr) {
      session.status = 'qr';
      session.qr = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
    }

    if (connection === 'open') {
      session.status = 'open';
      session.qr = undefined;
      session.retries = 0;
      session.phone = jidNormalizedUser(sock.user?.id || '').split('@')[0];
      session.name = sock.user?.name || sock.user?.verifiedName || '';
      return;
    }

    if (connection !== 'close') return;
    const code = lastDisconnect?.error?.output?.statusCode;
    stopSocket(session);

    if (code === DisconnectReason.loggedOut) {
      // Unlinked from the phone (Linked devices → Log out): the saved
      // session is dead, so drop it rather than retrying forever.
      removeSessionFiles(key);
      Object.assign(session, {
        status: 'closed',
        qr: undefined,
        phone: undefined,
        name: undefined,
        error: 'This WhatsApp was logged out from the phone. Link it again.',
      });
      return;
    }
    if (code === DisconnectReason.connectionReplaced) {
      session.status = 'closed';
      session.error =
        'Another server process took over this WhatsApp session. Run the backend as a single instance, then reconnect.';
      return;
    }
    if (!state.creds.me) {
      // The QR expired without being scanned — wait for "Link" again.
      removeSessionFiles(key);
      Object.assign(session, {
        status: 'closed',
        qr: undefined,
        error: 'The QR code expired. Click Link WhatsApp to get a new one.',
      });
      return;
    }
    // Restart-required right after pairing, or a network drop: reconnect,
    // backing off on repeated failures.
    const delay =
      code === DisconnectReason.restartRequired
        ? 0
        : Math.min(1000 * 2 ** session.retries, MAX_RECONNECT_DELAY_MS);
    session.retries += 1;
    session.status = 'connecting';
    session.timer = setTimeout(() => {
      startSocket(key).catch((err) => {
        session.status = 'closed';
        session.error = err.message;
      });
    }, delay);
  });
}

/** Reconnects every saved session — call once at server start. */
async function restoreSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return;
  for (const key of fs.readdirSync(SESSIONS_DIR)) {
    const paired = readPaired(key);
    // Only a readable, never-scanned session is cleaned up. An unreadable
    // one (e.g. caught mid-write) is left on disk untouched, never deleted.
    if (paired === false) {
      removeSessionFiles(key);
    } else if (paired) {
      await startSocket(key).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`WhatsApp session ${key} failed to restore:`, err.message);
      });
    }
  }
}

function getStatus(store) {
  const key = keyFor(store);
  const s = sessions.get(key);
  if (!s) return { status: isPaired(key) ? 'connecting' : 'closed' };
  return {
    status: s.status,
    qr: s.status === 'qr' ? s.qr : undefined,
    phone: s.status === 'open' ? s.phone : undefined,
    name: s.status === 'open' ? s.name : undefined,
    error: s.status === 'closed' ? s.error : undefined,
  };
}

/** Starts linking (a QR code appears in getStatus shortly after). */
async function connect(store) {
  const key = keyFor(store);
  const s = sessions.get(key);
  if (s && (s.status === 'open' || s.status === 'qr')) return getStatus(store);
  if (s) s.retries = 0;
  await startSocket(key);
  return getStatus(store);
}

/** Logs this server out of the linked WhatsApp and forgets the session. */
async function unlink(store) {
  const key = keyFor(store);
  const s = sessions.get(key);
  if (s?.sock && s.status === 'open') {
    try {
      await s.sock.logout();
    } catch {
      // Already gone on WhatsApp's side — still clear it locally.
    }
  }
  if (s) stopSocket(s);
  sessions.delete(key);
  removeSessionFiles(key);
}

const isOpen = (key) => sessions.get(key)?.status === 'open';

/**
 * The linked session a store sends through — its own, else the super
 * admin's global one — or null when neither is connected.
 */
function senderFor(store) {
  const own = keyFor(store);
  if (isOpen(own)) return own;
  if (isOpen(GLOBAL_KEY)) return GLOBAL_KEY;
  return null;
}

/**
 * Sends a text, or a PDF with the text as its caption, from a linked
 * session. `to` is the recipient as bare international digits.
 */
async function send(key, { to, text, document }) {
  const sock = sessions.get(key)?.sock;
  if (!sock || !isOpen(key)) {
    throw ApiError.badRequest('The linked WhatsApp is not connected right now. Check Settings.');
  }
  const [result] = (await sock.onWhatsApp(to)) || [];
  if (!result?.exists) {
    throw ApiError.badRequest(`${to} is not on WhatsApp.`);
  }
  // Multipart form fields arrive with CRLF line breaks.
  text = String(text ?? '').replace(/\r\n/g, '\n');
  const content = document
    ? {
        document: document.buffer,
        mimetype: 'application/pdf',
        fileName: document.filename,
        caption: text,
      }
    : { text };
  await sock.sendMessage(result.jid, content);
}

module.exports = { restoreSessions, getStatus, connect, unlink, senderFor, send };
