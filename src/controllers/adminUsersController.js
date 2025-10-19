const Joi = require('joi');
const bcrypt = require('bcrypt');
const { emailExists, createUser, setTempPasswordAndForceChange, updateStatusById, findById, updateByIdPartial, emailExistsForOther, listUsers, getUsersStats } = require('../models/userModel');
const { revokeAllForUser } = require('../models/refreshModel');
const { genPassword } = require('../utils/passwords');
const { sendMail } = require('../services/mailer');

const createSchema = Joi.object({
  email: Joi.string().email().required(),
  name:  Joi.string().min(2).max(120).required(),
  role:  Joi.string().valid('admin','operator','supervisor','unit').required(),
  phone: Joi.string().allow(null, '')
});

async function createStaff(req, res, next) {
  try {
    const { value, error } = createSchema.validate(req.body);
    if (error) return res.status(400).json({ error:'BadRequest', message:error.message });
    if (await emailExists(value.email)) return res.status(409).json({ error:'Conflict', message:'Email ya registrado' });

  const temp = genPassword(12);
  const hash = await bcrypt.hash(temp, 12);

    const id = await createUser(null, {
      email: value.email,
      phone: value.phone || null,
      password_hash: hash,
      role: value.role,
      status: 'active'
    });

    // Email con la clave temporal
    const portal = process.env.PORTAL_URL || 'http://localhost:4200';
    await sendMail({
      to: value.email,
      subject: 'Tu acceso temporal - PNC Panic',
      text:
`Hola${value.name ? ' ' + value.name : ''},
Se creó una cuenta para ti en PNC Panic.

Usuario: ${value.email}
Clave temporal: ${temp}

Por seguridad, inicia sesión y cambia tu contraseña:
${portal}

Si no reconoces este correo, ignóralo.`,
      html:
`<p>Hola${value.name ? ' <b>' + value.name + '</b>' : ''},</p>
<p>Se creó una cuenta para ti en <b>PNC Panic</b>.</p>
<ul>
  <li><b>Usuario:</b> ${value.email}</li>
  <li><b>Clave temporal:</b> <code>${temp}</code></li>
 </ul>
<p>Por seguridad, inicia sesión y cambia tu contraseña:<br>
<a href="${portal}">${portal}</a></p>
<p>Si no reconoces este correo, ignóralo.</p>`
    });

  console.log(`📝 Usuario staff creado ${id} (${value.email}) tempPass=${temp}`);
  res.status(201).json({ id, ...(process.env.RETURN_TEMP_PASSWORD === '1' ? { tempPassword: temp } : {}) });
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const id = Number(req.params.id);
    const user = await findById(id);
    if (!user) return res.status(404).json({ error:'NotFound', message:'Usuario no existe' });

  const temp = genPassword(12);
  const hash = await bcrypt.hash(temp, 12);

  // Forzamos cambio en siguiente login
  await setTempPasswordAndForceChange(id, hash);
  await revokeAllForUser(id);

    const portal = process.env.PORTAL_URL || 'http://localhost:4200';
    await sendMail({
  to: user.email,
  subject: 'Restablecimiento de contraseña - PNC Panic',
  text:
`Hola,
Tu contraseña fue restablecida por un administrador.

Clave temporal: ${temp}

Inicia sesión y cámbiala inmediatamente:
${portal}`,
  html:
`<p>Hola,</p>
<p>Tu contraseña fue restablecida por un administrador.</p>
<p><b>Clave temporal:</b> <code>${temp}</code></p>
<p>Inicia sesión y cámbiala inmediatamente:<br>
<a href="${portal}">${portal}</a></p>`
    });

    console.log(`🔐 Reset password para user ${id} tempPass=${temp}`);
    if (process.env.RETURN_TEMP_PASSWORD === '1') {
      return res.status(200).json({ tempPassword: temp });
    }
    res.status(204).end();
  } catch (err) { next(err); }
}

const statusSchema = Joi.object({ status: Joi.string().valid('active','inactive').required() });
async function updateStatus(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { value, error } = statusSchema.validate(req.body);
    if (error) return res.status(400).json({ error:'BadRequest', message:error.message });
    const user = await findById(id);
    if (!user) return res.status(404).json({ error:'NotFound', message:'Usuario no existe' });
    await updateStatusById(id, value.status);
    if (value.status === 'inactive') await revokeAllForUser(id);
    res.status(204).end();
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    const id = Number(req.params.id);
    const user = await findById(id);
    if (!user) return res.status(404).json({ error: 'NotFound', message: 'Usuario no existe' });
    return res.json({ id: user.user_id, email: user.email, phone: user.phone, role: user.role, status: user.status });
  } catch (err) { next(err); }
}

const updateSchema = Joi.object({
  email: Joi.string().email().optional(),
  phone: Joi.string().allow(null, '').optional(),
  role:  Joi.string().valid('admin','operator','supervisor','unit').optional(),
  // UI might send full_name; not stored currently
  full_name: Joi.any().optional()
}).min(1);

async function update(req, res, next) {
  try {
    const id = Number(req.params.id);
    const existing = await findById(id);
    if (!existing) return res.status(404).json({ error: 'NotFound', message: 'Usuario no existe' });

    const { value, error } = updateSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });

    if (value.email) {
      const conflict = await emailExistsForOther(value.email, id);
      if (conflict) return res.status(409).json({ error: 'Conflict', message: 'Email ya registrado' });
    }

    const updated = await updateByIdPartial(id, { email: value.email, phone: value.phone, role: value.role });
    if (!updated) return res.status(400).json({ error: 'BadRequest', message: 'Nada para actualizar' });
    return res.json({ id: updated.user_id, email: updated.email, phone: updated.phone, role: updated.role, status: updated.status });
  } catch (err) { next(err); }
}

// exports consolidated at end
// GET /api/v1/admin/users  (lista paginada + filtros)
async function list(req, res, next) {
  try {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 20;
    const { q, role, status } = req.query;

    const { total, rows } = await listUsers({ q, role, status, page, limit });

    const items = rows.map(r => ({
      id: r.user_id,
      email: r.email,
      phone: r.phone,
      role: r.role,
      status: r.status,
      must_change: !!r.must_change_password,
      created_at: r.created_at,
      updated_at: r.updated_at
    }));

    res.json({ items, page, total });
  } catch (err) { next(err); }
}

// GET /api/v1/admin/users/stats  (KPIs de la cabecera)
async function stats(req, res, next) {
  try {
    const s = await getUsersStats();
    res.json({
      total: Number(s.total) || 0,
      active: Number(s.active) || 0,
      operators: Number(s.operators) || 0,
      inactive: Number(s.inactive) || 0
    });
  } catch (err) { next(err); }
}

module.exports = {
  createStaff, resetPassword, updateStatus, getById, update,
  list, stats
};
