const crypto = require('crypto');

/** Genera una contraseña aleatoria con letras, dígitos y símbolos */
function genPassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+';
  const bytes = crypto.randomBytes(len);
  return [...bytes].map(b => chars[b % chars.length]).join('');
}

module.exports = { genPassword };
