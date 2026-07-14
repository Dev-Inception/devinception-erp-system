const ApiError = require('./ApiError');

// Financial reports use business calendar dates. Pakistan does not observe
// daylight saving time, so a fixed offset is deterministic across servers and
// can still be overridden for another deployment.
const OFFSET_PATTERN = /^([+-])(\d{2}):(\d{2})$/;

function configuredOffset() {
  // Read at call time: app.js imports routes before centralized dotenv config,
  // so capturing this during module evaluation would ignore a .env override.
  const value = process.env.REPORT_TIMEZONE_OFFSET || '+05:00';
  const match = OFFSET_PATTERN.exec(value);
  if (!match) throw new Error('REPORT_TIMEZONE_OFFSET must use +HH:MM or -HH:MM');
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) {
    throw new Error('REPORT_TIMEZONE_OFFSET is outside the valid range');
  }
  return value;
}

function offsetMinutes() {
  const match = OFFSET_PATTERN.exec(configuredOffset());
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  const total = hours * 60 + minutes;
  return match[1] === '-' ? -total : total;
}

function isCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseReportDate(value, field, { endOfDay = false } = {}) {
  if (!isCalendarDate(value)) {
    throw ApiError.badRequest(`Invalid '${field}' date; expected YYYY-MM-DD`);
  }
  const time = endOfDay ? '23:59:59.999' : '00:00:00.000';
  return new Date(`${value}T${time}${configuredOffset()}`);
}

function formatReportDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() + offsetMinutes() * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

module.exports = { parseReportDate, formatReportDate, isCalendarDate };
