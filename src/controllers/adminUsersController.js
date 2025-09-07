const Joi = require('joi');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { emailExists, createUser, updatePasswordById, updateStatusById, findById } = require('../models/userModel');
const { revokeAllForUser } = require('../models/refreshModel');

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
    const temp = crypto.randomBytes(12).toString('base64url');
    const hash = await bcrypt.hash(temp, 12);
    const id = await createUser(null, { email: value.email, phone: value.phone || null, password_hash: hash, role: value.role, status: 'active' });
    console.log(`📝 Usuario staff creado ${id} (${value.email}) tempPass=${temp}`);
    res.status(201).json({ id });
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const id = Number(req.params.id);
    const user = await findById(id);
    if (!user) return res.status(404).json({ error:'NotFound', message:'Usuario no existe' });
    const temp = crypto.randomBytes(10).toString('base64url');
    const hash = await bcrypt.hash(temp, 12);
    await updatePasswordById(id, hash);
    await revokeAllForUser(id);
    console.log(`🔐 Reset password para user ${id} tempPass=${temp}`);
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

module.exports = { createStaff, resetPassword, updateStatus };
