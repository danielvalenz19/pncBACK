const Joi = require('joi');
const { listAudit } = require('../../models/opsModel');

const q = Joi.object({
  actor: Joi.number().integer(),
  action: Joi.string(),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50)
});

async function list(req, res, next) {
  try {
    const { value, error } = q.validate(req.query || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const out = await listAudit(value);
    res.json(out);
  } catch (e) { next(e); }
}

module.exports = { list };
