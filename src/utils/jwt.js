const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const ACCESS_TTL = '15m';
const REFRESH_DAYS = 7; // para DB

function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });
}

function signRefreshToken(payload, jti) {
  return jwt.sign({ ...payload, jti }, process.env.JWT_REFRESH_SECRET, { expiresIn: `${REFRESH_DAYS}d` });
}

function newJti() {
  return uuidv4();
}

module.exports = { signAccessToken, signRefreshToken, newJti, REFRESH_DAYS };
