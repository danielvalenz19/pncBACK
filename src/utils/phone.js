// Normalization utilities for phone numbers (Guatemala focus)
// Canon format: +502XXXXXXXX (8 digits after country code)
function normalizeGT(p) {
  if (!p) return null;
  const x = String(p).trim().replace(/\s+/g,'').replace(/^00/, '+');
  if (x.startsWith('+502')) return x;
  if (x.startsWith('502')) return '+' + x;
  if (/^\d{8}$/.test(x)) return '+502' + x;
  return x; // keep as-is for other countries / unexpected formats
}

module.exports = { normalizeGT };
