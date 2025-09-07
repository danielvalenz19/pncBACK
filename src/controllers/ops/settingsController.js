const Joi = require('joi');
const settings = require('../../models/settingsModel');
const { logAudit } = require('../../services/audit');

async function get(_req, res, next) {
  try {
    const data = await settings.getAll();
    res.json(data);
  } catch (e) { next(e); }
}

const patchSchema = Joi.object({
  countdown_seconds: Joi.number().integer().min(5).max(600),
  ping_interval_seconds: Joi.number().integer().min(1).max(120),
  data_retention_days: Joi.number().integer().min(1).max(3650),
  sla_ack_seconds: Joi.number().integer().min(5).max(600)
}).min(1);

async function patch(req, res, next) {
  try {
    const { value, error } = patchSchema.validate(req.body || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    await settings.patch(value, req.user.user_id);
    await logAudit({ who: req.user.user_id, action: 'UPDATE', entity: 'settings', entityId: 'global', ip: req.ip, meta: value });
    res.status(204).end();
  } catch (e) { next(e); }
}

module.exports = { get, patch };
