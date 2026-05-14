function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function parseId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function parsePositiveAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatLocalDate(dateObj) {
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  return `${day}/${month}/${year}`;
}

function getCurrentMonth(dateObj = new Date()) {
  return dateObj.toISOString().slice(0, 7);
}

function jsonError(res, status, error) {
  return res.status(status).json({ error });
}

module.exports = {
  formatLocalDate,
  getCurrentMonth,
  jsonError,
  normalizeEmail,
  normalizeString,
  parseId,
  parsePositiveAmount
};
