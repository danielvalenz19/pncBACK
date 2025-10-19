const Joi = require('joi');
const { createDemoIncident, updateSimulationStatus } = require('../models/incidentsModel');
const { rt } = require('../realtime/io');

const createSchema = Joi.object({
  lat: Joi.number().required(),
  lng: Joi.number().required(),
  accuracy: Joi.number().min(0).optional(),
  battery: Joi.number().integer().min(0).max(100).optional(),
  device: Joi.object({
    os: Joi.string().optional(),
    version: Joi.string().optional()
  }).optional()
});

async function createDemo(req, res, next) {
  try {
    const { value, error } = createSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ error: 'ValidationError', message: error.message });
  const data = await createDemoIncident(value);
  rt.incidentNew({ id: data.id, lat: value.lat, lng: value.lng, created_at: new Date().toISOString(), status: 'NEW' });
  res.status(201).json(data);
  } catch (e) { next(e); }
}

const statusSchema = Joi.object({
  status: Joi.string().valid('PAUSED','RUNNING','CLOSED').required()
});

async function updateDemoStatus(req, res, next) {
  try {
    const { value, error } = statusSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ error: 'ValidationError', message: error.message });
    const result = await updateSimulationStatus({ incidentId: req.params.id, status: value.status });
    if (!result.ok) return res.status(result.code || 400).json({ error: 'SimulationError', message: result.msg });
    // Emitir solo estados válidos; PAUSED/RUNNING van como meta de simulación
    if (result.status === 'PAUSED') {
      rt.incidentUpdate(req.params.id, { meta: { sim_status: 'PAUSED' } });
    } else if (result.status === 'RUNNING') {
      rt.incidentUpdate(req.params.id, { meta: { sim_status: 'RUNNING' } });
    } else if (result.status === 'CLOSED') {
      rt.incidentUpdate(req.params.id, { status: 'CLOSED' });
    }
    res.json({ ok: true, status: result.status });
  } catch (e) { next(e); }
}

module.exports = { createDemo, updateDemoStatus };
