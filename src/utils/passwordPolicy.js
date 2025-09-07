function validateStrength(pwd) {
  const min = 8;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasLower = /[a-z]/.test(pwd);
  const hasDigit = /[0-9]/.test(pwd);
  const hasSymbol = /[^A-Za-z0-9]/.test(pwd);
  const longEnough = (pwd || '').length >= min;
  const ok = longEnough && hasUpper && hasLower && hasDigit && hasSymbol;
  return { ok, longEnough, hasUpper, hasLower, hasDigit, hasSymbol };
}

module.exports = { validateStrength };
