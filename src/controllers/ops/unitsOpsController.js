const Joi = require('joi');
const model = require('../../models/opsModel');
const assignments = require('../../models/assignmentsModel');
const { rt } = require('../../realtime/io');
const { pool } = require('../../config/db');
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

async function activeAssignment(req, res, next) {
  try {
    const unitId = Number(req.params.id);
    const incidentId = await assignments.getActiveIncidentIdByUnit(pool, unitId);
    res.json({ incidentId: incidentId || null });
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
    const unitId = Number(req.params.id);
    const { status } = value;

    // Seguridad: solo estados permitidos (ya validado por Joi)
    const incidentId = await model.getActiveIncidentIdByUnit(pool, unitId);

    // Bloqueo: no permitir available si hay asignación activa
    if (status === 'available' && incidentId) {
      return res.status(409).json({ error: 'Conflict', message: `La unidad está asignada al incidente ${incidentId}. Cierra el incidente o libera la unidad desde el caso.` });
    }

    // Para out_of_service con asignación activa: permitir sólo si force=true → limpia asignación
    if (incidentId && status === 'out_of_service' && req.body.force === true) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await assignments.closeAssignmentsForUnit(conn, unitId);
        await conn.execute(`UPDATE units SET status = ? WHERE id = ?`, [status, unitId]);
        await conn.commit();
      } catch (e) {
        try { await conn.rollback(); } catch (_e) {}
        conn.release();
        throw e;
      } finally { conn.release(); }
    } else {
      // No special action: normal update (may still change status to en_route/on_site/available)
      const ok = await model.updateUnit(unitId, value);
      if (!ok) return res.status(404).json({ error: 'NotFound', message: 'Unidad no existe' });
    }

    await logAudit({ who: req.user.user_id, action: 'UPDATE', entity: 'unit', entityId: req.params.id, ip: req.ip, meta: value });
    rt.unitUpdate({ id: unitId, ...(status ? { status } : {}), last_seen: new Date().toISOString() });
    res.status(204).end();
  } catch (e) { next(e); }
}

module.exports = { list, create, update, activeAssignment };
