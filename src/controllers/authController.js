const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Joi = require('joi');

const { findActiveByEmail, emailExists, createUser, setPasswordAndClearForce, getAuthById, findById, getProfileById } = require('../models/userModel');
const { createCitizen, getKbaDataByEmail } = require('../models/citizenModel');
const { saveRefresh, getRefresh, revokeRefresh, revokeAllForUser } = require('../models/refreshModel');
const { recordAttempt } = require('../models/passwordResetModel');
const { signAccessToken, signRefreshToken, newJti, REFRESH_DAYS } = require('../utils/jwt');
const { pool } = require('../config/db');
const { validateStrength } = require('../utils/passwordPolicy');

// -------------------- REGISTER (app ciudadanos) --------------------
// Accept both legacy "name" and new canonical "full_name"; require at least one
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(120),
  full_name: Joi.string().min(2).max(120),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  phone: Joi.string().allow(null, ''),
  pin: Joi.string().pattern(/^[0-9]{4,6}$/).optional()
}).custom((v, helpers) => {
  if (!v.name && !v.full_name) return helpers.error('any.custom', { message: 'Debe enviar full_name' });
  return v;
}, 'name/full_name requirement');

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register citizen (app)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string }
 *               name: { type: string, description: 'legacy alias of full_name' }
 *               email: { type: string }
 *               password: { type: string }
 *               phone: { type: string }
 *     responses:
 *       201: { description: Created }
 */
const { normalizeGT } = require('../utils/phone');

async function register(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { value, error } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });

    if (await emailExists(value.email)) {
      return res.status(409).json({ error: 'Conflict', message: 'Email ya registrado' });
    }

  const fullName = value.full_name || value.name; // canonical
  const password_hash = await bcrypt.hash(value.password, 12);

  const normalizedPhone = normalizeGT(value.phone);

  let pinPlain = value.pin || (value.phone ? (String(value.phone).replace(/\D/g,'').slice(-4) || '0000') : '0000');
    const emergency_pin_hash = await bcrypt.hash(pinPlain, 12);

  await conn.beginTransaction();

  const userId = await createUser(conn, {
      email: value.email,
      full_name: fullName,
      phone: normalizedPhone,
      password_hash,
      role: 'citizen',
      status: 'active'
    });

  await createCitizen(conn, {
      user_id: userId,
      name: fullName, // keep mirror for now; trigger can sync later
      emergency_pin_hash
    });

  await conn.commit();

  const payload = { user_id: userId, role: 'citizen', email: value.email, must_change: false };
    const accessToken = signAccessToken(payload);
    const jti = newJti();
    const refreshToken = signRefreshToken({ user_id: userId, role: 'citizen' }, jti);
    await saveRefresh({ jti, userId, ttlDays: REFRESH_DAYS, ip: req.ip, ua: req.headers['user-agent'] });

    res.status(201).json({ user_id: userId, accessToken, refreshToken });
  } catch (err) {
    try { await conn.rollback(); } catch(_e){}
    next(err);
  } finally {
    conn.release();
  }
}

// -------------------- LOGIN / REFRESH / LOGOUT (original + adapt) --------------------
const loginSchema = Joi.object({ email: Joi.string().email().required(), password: Joi.string().required() });
/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login user and return tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: OK }
 */
async function login(req, res, next) {
  try {
    const { value, error } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });

    const user = await findActiveByEmail(value.email);
    if (!user) return res.status(401).json({ error: 'Unauthorized', message: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(value.password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Unauthorized', message: 'Credenciales inválidas' });

  const payload = { user_id: user.user_id, role: user.role, email: user.email, must_change: !!user.must_change_password };
    const accessToken = signAccessToken(payload);
    const jti = newJti();
    const refreshToken = signRefreshToken({ user_id: user.user_id, role: user.role }, jti);
    await saveRefresh({ jti, userId: user.user_id, ttlDays: REFRESH_DAYS, ip: req.ip, ua: req.headers['user-agent'] });
  res.json({ accessToken, refreshToken, role: user.role, must_change: !!user.must_change_password });
  } catch (err) { next(err); }
}

const refreshSchema = Joi.object({ refreshToken: Joi.string().required() });
/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: OK }
 */
async function refresh(req, res, next) {
  try {
    const { value, error } = refreshSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const decoded = jwt.verify(value.refreshToken, process.env.JWT_REFRESH_SECRET);
    const row = await getRefresh(decoded.jti);
    if (!row || row.revoked) return res.status(401).json({ error: 'Unauthorized', message: 'Refresh inválido' });
    if (new Date(row.expires_at) < new Date()) return res.status(401).json({ error: 'Unauthorized', message: 'Refresh expirado' });
    const accessToken = signAccessToken({ user_id: decoded.user_id, role: decoded.role });
    res.json({ accessToken });
  } catch (err) { next(err); }
}

const logoutSchema = Joi.object({ refreshToken: Joi.string().required() });
/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout user (revoke refresh token)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: OK }
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

// -------------------- RECOVERY (verify + reset) --------------------
const verifySchema = Joi.object({
  email: Joi.string().email().required(),
  pin: Joi.string().pattern(/^[0-9]{4,6}$/),
  dpi: Joi.string(),
  phone_last4: Joi.string().pattern(/^[0-9]{4}$/)
}).custom((v, helpers) => {
  if (!v.pin && !v.dpi && !v.phone_last4) {
    return helpers.error('any.custom', { message: 'Debe enviar pin, dpi o phone_last4' });
  }
  return v;
}, 'KBA check');

const KBA_TTL_MIN = 10;
/**
 * @swagger
 * /api/v1/auth/recovery/verify:
 *   post:
 *     summary: Verifica identidad (pin|dpi|phone_last4) y devuelve kba_token
 *     tags: [Auth]
 */
async function recoveryVerify(req, res, next) {
  try {
    const { value, error } = verifySchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const row = await getKbaDataByEmail(value.email);
    if (!row || row.status !== 'active') {
      await recordAttempt({ email: value.email, method: 'unknown', success: 0, ip: req.ip, meta: { reason: 'not_found_or_inactive' } });
      return res.status(401).json({ error: 'Unauthorized', message: 'No válido' });
    }
    let ok = false, method = null;
    if (value.pin && row.emergency_pin_hash) { ok = await bcrypt.compare(value.pin, row.emergency_pin_hash); method = 'pin'; }
    else if (value.dpi && row.dpi) { ok = (value.dpi.trim() === row.dpi.trim()); method = 'dpi'; }
    else if (value.phone_last4 && row.phone) { const last4 = (row.phone || '').replace(/\D/g,'').slice(-4); ok = (last4 && last4 === value.phone_last4); method = 'phone_last4'; }
    await recordAttempt({ email: value.email, method: method || 'unknown', success: ok ? 1 : 0, ip: req.ip, meta: { ua: req.headers['user-agent'] } });
    if (!ok) return res.status(401).json({ error: 'Unauthorized', message: 'No válido' });
    const kba_token = jwt.sign({ purpose: 'pwd_reset', user_id: row.user_id }, process.env.JWT_SECRET, { expiresIn: `${KBA_TTL_MIN}m` });
    res.json({ kba_token });
  } catch (err) { next(err); }
}

const resetSchema = Joi.object({ kba_token: Joi.string().required(), new_password: Joi.string().required() });
/**
 * @swagger
 * /api/v1/auth/recovery/reset:
 *   post:
 *     summary: Cambia password usando kba_token
 *     tags: [Auth]
 *     responses:
 *       204: { description: No Content }
 */
async function recoveryReset(req, res, next) {
  try {
    const { value, error } = resetSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const payload = jwt.verify(value.kba_token, process.env.JWT_SECRET);
    if (!payload || payload.purpose !== 'pwd_reset') return res.status(401).json({ error: 'Unauthorized', message: 'Token inválido' });
    const policy = validateStrength(value.new_password);
    if (!policy.ok) {
      return res.status(400).json({ error:'BadRequest', message:'La contraseña debe tener mínimo 8 caracteres, mayúscula, minúscula, dígito y símbolo' });
    }
    const hash = await bcrypt.hash(value.new_password, 12);
    await setPasswordAndClearForce(payload.user_id, hash);
    await revokeAllForUser(payload.user_id);
    res.status(204).end();
  } catch (err) { next(err); }
}
// -------------------- CHANGE PASSWORD (nuevo, versión simple) --------------------
const changePwdSchema = Joi.object({
  current_password: Joi.string().required(),
  new_password: Joi.string().min(8).required()
});

async function changePassword(req, res, next) {
  try {
    const { value, error } = changePwdSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });

    const userId = req.user?.user_id;
    const userAuth = await getAuthById(userId);
    if (!userAuth || userAuth.status !== 'active') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Usuario inválido' });
    }

    const ok = await bcrypt.compare(value.current_password, userAuth.password_hash);
    if (!ok) return res.status(401).json({ error: 'Unauthorized', message: 'Credenciales inválidas' });

    const policy = validateStrength(value.new_password);
    if (!policy.ok) {
      return res.status(400).json({ error:'BadRequest', message:'La contraseña debe tener mínimo 8 caracteres, mayúscula, minúscula, dígito y símbolo' });
    }
    const hash = await bcrypt.hash(value.new_password, 12);
    await setPasswordAndClearForce(userId, hash);
    await revokeAllForUser(userId);

    res.status(204).end();
  } catch (err) { next(err); }
}

// ---- Perfil del usuario autenticado ----
async function me(req, res, next) {
  try {
    const uid = req.user?.user_id;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const profile = await getProfileById(uid);
    if (!profile) return res.status(404).json({ error: 'NotFound' });
    return res.json(profile);
  } catch (err) { next(err); }
}

// ---- Actualizar perfil autenticado ----
const updateMeSchema = Joi.object({
  full_name: Joi.string().min(2).max(120).optional(),
  name: Joi.string().min(2).max(120).optional(), // legacy alias, mapped to full_name
  phone: Joi.string().allow(null, '').optional(),
  address: Joi.string().allow(null, '').optional(),
  preferred_lang: Joi.string().valid('es','en').allow(null).optional()
}).min(1);

async function updateMe(req, res, next) {
  const conn = await pool.getConnection();
  try {
    const { value, error } = updateMeSchema.validate(req.body || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const uid = req.user?.user_id;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const fullName = value.full_name || value.name;
    const phone = value.phone !== undefined ? normalizeGT(value.phone) : undefined;

    await conn.beginTransaction();

    const userSets = [];
    const userParams = [];
    if (fullName !== undefined) { userSets.push('full_name=?'); userParams.push(fullName || null); }
    if (phone !== undefined) { userSets.push('phone=?'); userParams.push(phone); }
    if (userSets.length) {
      userParams.push(uid);
      await conn.query(`UPDATE users SET ${userSets.join(', ')}, updated_at=NOW() WHERE id=?`, userParams);
      // If you don't have DB trigger to mirror name to citizens, uncomment to mirror:
      // if (fullName !== undefined) await conn.query('UPDATE citizens SET name=? WHERE user_id=?', [fullName || null, uid]);
    }

    if (value.address !== undefined || value.preferred_lang !== undefined) {
      await conn.query(
        `UPDATE citizens SET
           address = COALESCE(?, address),
           preferred_lang = COALESCE(?, preferred_lang),
           updated_at = NOW()
         WHERE user_id=?`,
        [value.address ?? null, value.preferred_lang ?? null, uid]
      );
    }

    await conn.commit();
    const profile = await getProfileById(uid);
    return res.json(profile);
  } catch (err) {
    try { await conn.rollback(); } catch(_) {}
    next(err);
  } finally {
    conn.release();
  }
}

module.exports = { register, login, refresh, logout, changePassword, recoveryVerify, recoveryReset, me, updateMe };
