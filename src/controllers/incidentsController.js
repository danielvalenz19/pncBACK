const Joi = require('joi');
const {
  createIncident,
  addLocation,
  cancelIncident,
  getIncidentForUser
} = require('../models/incidentsModel');

const createSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  accuracy: Joi.number().min(0).optional(),
  battery: Joi.number().min(0).max(100).optional(),
  device: Joi.object({
    os: Joi.string().allow('', null),
    version: Joi.string().allow('', null)
  }).required()
});

async function create(req, res, next) {
  try {
    const { value, error } = createSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const out = await createIncident({
      userId: req.user.user_id,
      ...value
    });
    res.status(201).json(out);
  } catch (e) { next(e); }
}

const locationSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  accuracy: Joi.number().min(0).optional(),
  ts: Joi.number().optional()
});

async function pushLocation(req, res, next) {
  try {
    const { value, error } = locationSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });

    const r = await addLocation({
      incidentId: req.params.id,
      userId: req.user.user_id,
      ...value
    });
    if (!r.ok) return res.status(r.code).json({ error: 'Error', message: r.msg });
    res.status(202).json({ accepted: true });
  } catch (e) { next(e); }
}

const cancelSchema = Joi.object({ reason: Joi.string().allow('', null) });

async function cancel(req, res, next) {
  try {
    const { value, error } = cancelSchema.validate(req.body || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });

    const r = await cancelIncident({
      incidentId: req.params.id,
      userId: req.user.user_id,
      reason: value.reason
    });
    if (!r.ok) return res.status(r.code).json({ error: 'Error', message: r.msg });
    res.json({ status: r.status });
  } catch (e) { next(e); }
}

async function getOne(req, res, next) {
  try {
    const r = await getIncidentForUser(req.params.id, req.user.user_id);
    if (!r.ok) return res.status(r.code).json({ error: 'Error', message: r.msg });
    res.json(r.data);
  } catch (e) { next(e); }
}

module.exports = { create, pushLocation, cancel, getOne };
