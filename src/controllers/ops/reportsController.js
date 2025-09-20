const Joi = require('joi');
const model = require('../../models/opsModel');

const range = Joi.object({ from: Joi.date().iso().required(), to: Joi.date().iso().required() });
const trend = range.append({ group_by: Joi.string().valid('day','week','month').default('day') });

async function kpis(req, res, next) {
  try {
    const { value, error } = range.validate(req.query || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const data = await model.getKpis(value.from, value.to);
    res.json(data);
  } catch (e) { next(e); }
}

async function responseTimes(req, res, next) {
  try {
    const { value, error } = trend.validate(req.query || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const data = await model.getResponseTimes(value.from, value.to, value.group_by);
    res.json(data);
  } catch (e) { next(e); }
}

async function incidentsByStatus(req, res, next) {
  try {
    const { value, error } = range.validate(req.query || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const data = await model.getIncidentsByStatus(value.from, value.to);
    res.json(data);
  } catch (e) { next(e); }
}

async function incidentsVolume(req, res, next) {
  try {
    const { value, error } = trend.validate(req.query || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const data = await model.getIncidentsVolume(value.from, value.to, value.group_by);
    res.json(data);
  } catch (e) { next(e); }
}

module.exports = { kpis, responseTimes, incidentsByStatus, incidentsVolume };
