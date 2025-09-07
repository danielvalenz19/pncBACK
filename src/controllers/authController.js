const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Joi = require('joi');

const { findActiveByEmail } = require('../models/userModel');
const { saveRefresh, getRefresh, revokeRefresh } = require('../models/refreshModel');
const { signAccessToken, signRefreshToken, newJti, REFRESH_DAYS } = require('../utils/jwt');
 // Validation schemas
 const loginSchema = Joi.object({
   email: Joi.string().email().required(),
   password: Joi.string().required()
 });

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login user and return tokens
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 */
async function login(req, res, next) {
  try {
    const { value, error } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });

    const user = await findActiveByEmail(value.email);
    if (!user) return res.status(401).json({ error: 'Unauthorized', message: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(value.password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Unauthorized', message: 'Credenciales inválidas' });

    const payload = { user_id: user.user_id, role: user.role, email: user.email };
    const accessToken = signAccessToken(payload);

    const jti = newJti();
    const refreshToken = signRefreshToken({ user_id: user.user_id, role: user.role }, jti);
    await saveRefresh({
      jti,
      userId: user.user_id,
      ttlDays: REFRESH_DAYS,
      ip: req.ip,
      ua: req.headers['user-agent']
    });

    res.json({ accessToken, refreshToken });
  } catch (err) { next(err); }
}

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required()
});
/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 */
async function refresh(req, res, next) {
  try {
    const { value, error } = refreshSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });

    const decoded = jwt.verify(value.refreshToken, process.env.JWT_REFRESH_SECRET);
    const row = await getRefresh(decoded.jti);
    if (!row || row.revoked) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Refresh inválido' });
    }
    if (new Date(row.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Refresh expirado' });
    }

    const accessToken = signAccessToken({ user_id: decoded.user_id, role: decoded.role });
    res.json({ accessToken });
  } catch (err) { next(err); }
}

const logoutSchema = Joi.object({
  refreshToken: Joi.string().required()
});
/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout user by revoking refresh token
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
async function logout(req, res, next) {
  try {
    const { value, error } = logoutSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });

    const decoded = jwt.verify(value.refreshToken, process.env.JWT_REFRESH_SECRET);
    await revokeRefresh(decoded.jti);
    res.json({ message: 'Sesión terminada' });
  } catch (err) { next(err); }
}

module.exports = { login, refresh, logout };
