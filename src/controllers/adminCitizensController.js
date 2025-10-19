const model = require('../models/adminCitizensModel');
const Joi = require('joi');
const bcrypt = require('bcrypt');
const { emailExists, createUser } = require('../models/userModel');
const { createCitizen, getCitizenById } = require('../models/citizenModel');
const { pool } = require('../config/db');

exports.stats = async (req, res, next) => {
  try {
    const from = req.query.from || new Date(Date.now() - 30*864e5).toISOString().slice(0,10);
    const to   = req.query.to   || new Date().toISOString().slice(0,10);
    const data = await model.getStats({ from, to });
    res.json(data);
  } catch (e) { next(e); }
};

exports.list = async (req, res, next) => {
  try {
    const { q=null, status=null, page=1, limit=20 } = req.query;
    const data = await model.listCitizens({
      q, status,
      page: Number(page) || 1,
      limit: Number(limit) || 20
    });
    res.json({ items: data.rows, total: data.total, page: data.page, limit: data.limit });
  } catch (e) { next(e); }
};

exports.getOne = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = await model.getCitizenById(id);
    if (!data.citizen) return res.status(404).json({ error:'NotFound', message:'Ciudadano no existe' });
    res.json(data);
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ok = await model.updateCitizen(id, req.body || {});
    if (!ok) return res.status(404).json({ error:'NotFound', message:'Ciudadano no existe' });
    res.status(204).end();
  } catch (e) { next(e); }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (!['active','inactive'].includes(status)) {
      return res.status(400).json({ error:'BadRequest', message:'status inválido' });
    }
    const ok = await model.updateCitizenStatus(id, status);
    if (!ok) return res.status(404).json({ error:'NotFound', message:'Ciudadano no existe' });
    res.status(204).end();
  } catch (e) { next(e); }
};

// Crear ciudadano (role='citizen')
const createSchema = Joi.object({
  name:     Joi.string().min(2).max(120).required(),
  email:    Joi.string().email().required(),
  phone:    Joi.string().allow('', null),
  dpi:      Joi.string().allow('', null),
  address:  Joi.string().allow('', null),
  password: Joi.string().min(8).required(),
  pin:      Joi.string().pattern(/^\d{4}$/).allow('', null)
}).required();

exports.create = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { value, error } = createSchema.validate(req.body || {});
    if (error) return res.status(400).json({ error:'BadRequest', message:error.message });

    if (await emailExists(value.email)) {
      return res.status(409).json({ error:'Conflict', message:'Email ya registrado' });
    }

    const password_hash = await bcrypt.hash(value.password, 12);
    const pinPlain = value.pin || (value.phone ? (value.phone.replace(/\D/g,'').slice(-4) || '0000') : '0000');
    const emergency_pin_hash = await bcrypt.hash(pinPlain, 12);

    await conn.beginTransaction();
    const userId = await createUser(conn, {
      email: value.email,
      full_name: value.name,
      phone: value.phone || null,
      password_hash,
      role: 'citizen',
      status: 'active'
    });

    await createCitizen(conn, {
      user_id: userId,
      name: value.name,
      dpi: value.dpi || null,
      address: value.address || null,
      emergency_pin_hash
    });

    await conn.commit();
    const citizen = await getCitizenById(userId);
    return res.status(201).json({ id: userId, ...citizen });
  } catch (e) {
    try { await conn.rollback(); } catch(_){ }
    next(e);
  } finally {
    conn.release();
  }
};
