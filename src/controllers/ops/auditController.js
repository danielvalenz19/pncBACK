const Joi = require('joi');
const { listAudit } = require('../../models/opsModel');
const { pool } = require('../../config/db');

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

// GET /api/v1/ops/audit/stats
async function stats(req, res, next) {
  try {
    const { from, to } = req.query;
    const where = [];
    const params = [];
    if (from) { params.push(new Date(from)); where.push('at >= ?'); }
    if (to)   { params.push(new Date(to));   where.push('at <= ?'); }
    const WHERE = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[{ total_actions }]] = await pool.query(`SELECT COUNT(*) AS total_actions FROM audit_logs ${WHERE}`, params);
  const [[{ unique_users }]] = await pool.query(`SELECT COUNT(DISTINCT who_user_id) AS unique_users FROM audit_logs ${WHERE} ${WHERE ? 'AND' : 'WHERE'} who_user_id IS NOT NULL`, params);
    const [[{ security_events }]] = await pool.query(
      `SELECT COUNT(*) AS security_events FROM audit_logs ${WHERE} ${WHERE ? 'AND' : 'WHERE'} action IN ('LOGIN','LOGOUT','PASSWORD_RESET','LOGIN_FAILED')`, params
    );
    const [[{ failed_logins }]] = await pool.query(
      `SELECT COUNT(*) AS failed_logins FROM audit_logs ${WHERE} ${WHERE ? 'AND' : 'WHERE'} action = 'LOGIN_FAILED'`, params
    );

    res.json({ total_actions, unique_users, security_events, failed_logins });
  } catch (e) { next(e); }
}

// GET /api/v1/ops/audit/top-activities
async function topActivities(req, res, next) {
  try {
    const { from, to, limit = 5 } = req.query;
    const where = [];
    const params = [];
    if (from) { params.push(new Date(from)); where.push('at >= ?'); }
    if (to)   { params.push(new Date(to));   where.push('at <= ?'); }
    const WHERE = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [topActions] = await pool.query(
      `SELECT action, COUNT(*) AS count FROM audit_logs ${WHERE} GROUP BY action ORDER BY count DESC LIMIT ?`, [...params, Number(limit)]
    );

    const [topUsers] = await pool.query(
      `SELECT who_user_id AS user, COUNT(*) AS count FROM audit_logs ${WHERE} ${WHERE ? 'AND' : 'WHERE'} who_user_id IS NOT NULL GROUP BY who_user_id ORDER BY count DESC LIMIT ?`, [...params, Number(limit)]
    );

    res.json({ top_actions: topActions, top_users: topUsers });
  } catch (e) { next(e); }
}

module.exports = { list, stats, topActivities };
