const { pool } = require('../config/db');
async function logAudit({ who, action, entity, entityId, ip, meta }) { try { await pool.execute(`INSERT INTO audit_logs (who_user_id, action, entity, entity_id, ip, meta_json) VALUES (?, ?, ?, ?, ?, ?)`, [who || null, action, entity, String(entityId), ip || null, JSON.stringify(meta || {})]); } catch(e){ console.warn('AUDIT log error:', e.message); } }
module.exports = { logAudit };
