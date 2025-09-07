const { pool } = require('../config/db');
const KEYS=['countdown_seconds','ping_interval_seconds','data_retention_days','sla_ack_seconds'];
const DEFAULTS={ countdown_seconds:30, ping_interval_seconds:5, data_retention_days:90, sla_ack_seconds:60 };
async function getAll(){ const [rows]=await pool.query(`SELECT key_name, value_json FROM settings WHERE key_name IN (?, ?, ?, ?)`, KEYS); const out={ ...DEFAULTS }; for(const r of rows){ const val=JSON.parse(r.value_json || '{}')?.value; if(val!==undefined && val!==null) out[r.key_name]=val; } return out; }
async function patch(updates, byUserId){ const conn=await pool.getConnection(); try{ await conn.beginTransaction(); for(const key of KEYS){ if(updates[key]===undefined) continue; await conn.execute(`INSERT INTO settings (key_name, value_json, updated_by) VALUES (?, JSON_OBJECT('value', ?), ?) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json), updated_by=VALUES(updated_by), updated_at=NOW()`, [key, updates[key], byUserId || null]); } await conn.commit(); } catch(e){ try{ await conn.rollback(); } catch(_){} throw e; } finally { conn.release(); } }
module.exports = { getAll, patch };
