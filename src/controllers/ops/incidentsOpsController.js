const Joi = require('joi');
const model = require('../../models/opsModel');
const { rt } = require('../../realtime/io');
const { logAudit } = require('../../services/audit');

const listSchema = Joi.object({
  status: Joi.string().valid('NEW','ACK','DISPATCHED','IN_PROGRESS','CLOSED','CANCELED'),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  geo: Joi.string().pattern(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/).optional(),
  q: Joi.string().allow(''),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50)
});

async function list(req, res, next) {
  try {
    const { value, error } = listSchema.validate(req.query);
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const out = await model.listIncidents(value);
    res.json(out);
  } catch (e) { next(e); }
}

async function getOne(req, res, next) {
  try {
    const data = await model.getIncidentDetails(req.params.id);
    if (!data) return res.status(404).json({ error: 'NotFound', message: 'Incidente no existe' });
    res.json(data);
  } catch (e) { next(e); }
}

async function ack(req, res, next) {
  try {
    const result = await model.ackIncident({ id: req.params.id, by: req.user.user_id });
    if (!result.ok) return res.status(result.code).json({ error: 'Error', message: result.msg });
    await logAudit({ who: req.user.user_id, action: 'ACK', entity: 'incident', entityId: req.params.id, ip: req.ip });
  rt.incidentUpdate(req.params.id, { status: 'ACK' });
  res.json({ status: 'ACK' });
  } catch (e) { next(e); }
}

const assignSchema = Joi.object({ unit_id: Joi.number().integer().required(), note: Joi.string().allow('', null) });
async function assign(req, res, next) {
  try {
    const { value, error } = assignSchema.validate(req.body || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const r = await model.assignUnit({ id: req.params.id, unitId: value.unit_id, note: value.note, by: req.user.user_id });
    if (!r.ok) return res.status(r.code).json({ error: 'Error', message: r.msg });
    await logAudit({ who: req.user.user_id, action: 'ASSIGN', entity: 'incident', entityId: req.params.id, ip: req.ip, meta: { unit_id: value.unit_id }});
  rt.incidentUpdate(req.params.id, { assignment: { unit_id: value.unit_id, note: value.note || null, at: new Date().toISOString() } });
  rt.incidentUpdate(req.params.id, { status: 'DISPATCHED' });
  res.json({ status: 'DISPATCHED' });
  } catch (e) { next(e); }
}

const statusSchema = Joi.object({ status: Joi.string().valid('DISPATCHED','IN_PROGRESS','CLOSED').required(), reason: Joi.string().allow('', null) });
async function setStatus(req, res, next) {
  try {
    const { value, error } = statusSchema.validate(req.body || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const r = await model.updateIncidentStatus({ id: req.params.id, status: value.status, reason: value.reason, by: req.user.user_id });
    if (!r.ok) return res.status(r.code).json({ error: 'Error', message: r.msg });
    await logAudit({ who: req.user.user_id, action: `STATUS_${value.status}`, entity: 'incident', entityId: req.params.id, ip: req.ip, meta: { reason: value.reason || null }});
  const patch = { status: value.status };
  if (value.reason) patch.event = { type: 'STATUS_REASON', reason: value.reason };
  rt.incidentUpdate(req.params.id, patch);
  res.json({ status: value.status });
  } catch (e) { next(e); }
}

const noteSchema = Joi.object({ text: Joi.string().min(1).required() });
async function addNote(req, res, next) {
  try {
    const { value, error } = noteSchema.validate(req.body || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const r = await model.addNote({ id: req.params.id, text: value.text, by: req.user.user_id });
    if (!r.ok) return res.status(r.code).json({ error: 'Error', message: r.msg });
    await logAudit({ who: req.user.user_id, action: 'NOTE', entity: 'incident', entityId: req.params.id, ip: req.ip });
    res.json(r.data);
  } catch (e) { next(e); }
}

module.exports = { list, getOne, ack, assign, setStatus, addNote };
