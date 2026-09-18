const nodemailer = require('nodemailer');
const env = require('../config/env');

/**
 * Lazily-created SMTP transport. In development without SMTP creds the
 * mail is logged to the console instead of being sent, so the flow is
 * still testable.
 */
let transporter;

// Placeholder values shipped in .env.example. They look configured but can't
// authenticate, so treat them as "unset" and fall back to console logging
// rather than attempting a doomed SMTP send (which makes forgot-password fail).
const PLACEHOLDER_CREDS = new Set(['your_smtp_user', 'your_smtp_pass']);

function isConfigured() {
  const { host, user, pass } = env.mail;
  if (!host || !user) return false;
  if (PLACEHOLDER_CREDS.has(user) || PLACEHOLDER_CREDS.has(pass)) return false;
  return true;
}

function getTransporter() {
  if (transporter) return transporter;

  if (!isConfigured()) {
    return null; // signals "console fallback"
  }

  transporter = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.port === 465,
    auth: { user: env.mail.user, pass: env.mail.pass },
  });
  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  const tx = getTransporter();

  if (!tx) {
    // eslint-disable-next-line no-console
    console.log('\n--- EMAIL (dev fallback) ---');
    // eslint-disable-next-line no-console
    console.log(`To: ${to}\nSubject: ${subject}\n${text || html}`);
    // eslint-disable-next-line no-console
    console.log('--- END EMAIL ---\n');
    return;
  }

  await tx.sendMail({ from: env.mail.from, to, subject, html, text });
}

// Per-store SMTP transport, keyed by store id (or 'global' for the fallback
// env-based one) — built once per set of credentials, not per send, same
// lazy-cache idea as the module-level `transporter` above.
const storeTransporters = new Map();

function isStoreConfigured(settings) {
  return !!(settings.smtpHost && settings.smtpUser && settings.smtpPass);
}

function getStoreTransporter(settings) {
  if (!isStoreConfigured(settings)) return null;
  const cacheKey = `${settings.smtpHost}:${settings.smtpPort}:${settings.smtpUser}`;
  if (storeTransporters.has(cacheKey)) return storeTransporters.get(cacheKey);

  const port = Number(settings.smtpPort) || 587;
  const tx = nodemailer.createTransport({
    host: settings.smtpHost,
    port,
    secure: port === 465,
    auth: { user: settings.smtpUser, pass: settings.smtpPass },
  });
  storeTransporters.set(cacheKey, tx);
  return tx;
}

// Whether a real send is actually possible — store's own SMTP or the
// platform's shared one. Used by callers (e.g. the "send invoice" endpoint)
// that must refuse rather than silently fall through to the dev-console
// log below, which would otherwise report success for a customer-facing
// send that never left the server.
function isEmailConfiguredAs(settings) {
  return isStoreConfigured(settings) || isConfigured();
}

/**
 * Sends using a store's own SMTP settings (Settings.smtp*, already resolved
 * with the super-admin fallback by settingsService.getSettings) when
 * configured, falling back to the shared platform SMTP (env `SMTP_*`) so a
 * store that hasn't set up its own can still send — same dev-console
 * fallback as `sendEmail` if neither is configured. Callers where "it
 * printed to the server console" isn't an acceptable outcome should check
 * `isEmailConfiguredAs` first and refuse before calling this.
 */
async function sendEmailAs(settings, { to, subject, html, text }) {
  const tx = getStoreTransporter(settings) || getTransporter();
  const from = settings.smtpFrom || env.mail.from;

  if (!tx) {
    // eslint-disable-next-line no-console
    console.log('\n--- EMAIL (dev fallback) ---');
    // eslint-disable-next-line no-console
    console.log(`From: ${from}\nTo: ${to}\nSubject: ${subject}\n${text || html}`);
    // eslint-disable-next-line no-console
    console.log('--- END EMAIL ---\n');
    return;
  }

  await tx.sendMail({ from, to, subject, html, text });
}

async function sendPasswordResetEmail(to, resetUrl) {
  const subject = 'Reset your Point of Sale password';
  const text = `You requested a password reset. Open this link to set a new password (valid for ${env.resetTokenExpiresMin} minutes):\n\n${resetUrl}\n\nIf you didn't request this, ignore this email.`;
  const html = `
    <p>You requested a password reset.</p>
    <p><a href="${resetUrl}">Click here to set a new password</a> (valid for ${env.resetTokenExpiresMin} minutes).</p>
    <p>If you didn't request this, you can safely ignore this email.</p>`;

  await sendEmail({ to, subject, html, text });
}

module.exports = { sendEmail, sendEmailAs, isEmailConfiguredAs, sendPasswordResetEmail };
