const Joi = require('joi');
const { getKpis } = require('../../models/opsModel');

const q = Joi.object({
  from: Joi.date().iso().required(),
  to:   Joi.date().iso().required()
});

async function kpis(req, res, next) {
  try {
    const { value, error } = q.validate(req.query || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const data = await getKpis(value.from, value.to);
    res.json(data);
  } catch (e) { next(e); }
}

module.exports = { kpis };
