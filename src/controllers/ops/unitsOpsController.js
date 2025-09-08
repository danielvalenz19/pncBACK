const Joi = require('joi');
const model = require('../../models/opsModel');
const { rt } = require('../../realtime/io');
const { logAudit } = require('../../services/audit');

const listSchema = Joi.object({
  status: Joi.string().valid('available','en_route','on_site','out_of_service'),
  type: Joi.string().valid('patrol','moto','ambulance')
});

async function list(req, res, next) {
  try {
    const { value, error } = listSchema.validate(req.query || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const rows = await model.listUnits(value);
    res.json(rows);
  } catch (e) { next(e); }
}

const createSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  type: Joi.string().valid('patrol','moto','ambulance').required(),
  plate: Joi.string().allow('', null),
  active: Joi.boolean().default(true)
});

async function create(req, res, next) {
  try {
    const { value, error } = createSchema.validate(req.body || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
  const id = await model.createUnit(value);
    await logAudit({ who: req.user.user_id, action: 'CREATE', entity: 'unit', entityId: id, ip: req.ip, meta: value });
  rt.unitUpdate({ id, status: 'available', last_seen: new Date().toISOString() });
  res.status(201).json({ id });
  } catch (e) { next(e); }
}

const updateSchema = Joi.object({
  name: Joi.string().min(2).max(80),
  type: Joi.string().valid('patrol','moto','ambulance'),
  plate: Joi.string().allow('', null),
  active: Joi.boolean(),
  status: Joi.string().valid('available','en_route','on_site','out_of_service')
}).min(1);

async function update(req, res, next) {
  try {
    const { value, error } = updateSchema.validate(req.body || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const ok = await model.updateUnit(Number(req.params.id), value);
    if (!ok) return res.status(404).json({ error: 'NotFound', message: 'Unidad no existe' });
    await logAudit({ who: req.user.user_id, action: 'UPDATE', entity: 'unit', entityId: req.params.id, ip: req.ip, meta: value });
  rt.unitUpdate({ id: Number(req.params.id), ...('status' in value ? { status: value.status } : {}), last_seen: new Date().toISOString() });
  res.status(204).end();
  } catch (e) { next(e); }
}

module.exports = { list, create, update };
