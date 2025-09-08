const { pool } = require('../config/db');
const { nextFolio, formatIncidentId } = require('./idCounterModel');
const { createUser, emailExists } = require('./userModel');
const { createCitizen } = require('./citizenModel');
const bcrypt = require('bcrypt');

async function createIncident({ userId, lat, lng, accuracy, battery, device }) {
  const year = new Date().getFullYear();
  const seq = await nextFolio('incident', year);
  const incidentId = formatIncidentId(year, seq);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO incidents
        (id, citizen_id, priority, status, lat, lng, accuracy, init_battery, device_os, device_ver, is_demo, started_at)
       VALUES (?, ?, 3, 'NEW', ?, ?, ?, ?, ?, ?, 0, NOW())`,
      [
        incidentId, userId,
        lat, lng, accuracy || null,
        battery || null,
        device?.os || null, device?.version || null
      ]
    );

    await conn.execute(
      `INSERT INTO incident_events (incident_id, type, at, by_user_id, notes, payload_json, created_at)
       VALUES (?, 'NEW', NOW(), ?, NULL, JSON_OBJECT('lat', ?, 'lng', ?, 'accuracy', ?, 'battery', ?, 'device', JSON_OBJECT('os', ?, 'version', ?)), NOW())`,
      [incidentId, userId, lat, lng, accuracy || null, battery || null, device?.os || null, device?.version || null]
    );

    await conn.execute(
      `INSERT INTO incident_events (incident_id, type, at, by_user_id, payload_json, created_at)
       VALUES (?, 'LOCATION', NOW(), ?, JSON_OBJECT('lat', ?, 'lng', ?, 'accuracy', ?), NOW())`,
      [incidentId, userId, lat, lng, accuracy || null]
    );

    await conn.commit();
    return { id: incidentId, status: 'NEW' };
  } catch (e) {
    try { await conn.rollback(); } catch(_){}
    throw e;
  } finally {
    conn.release();
  }
}

async function assertOwner(incidentId, userId) {
  const [rows] = await pool.execute(
    `SELECT id, citizen_id, status, started_at, ended_at, lat, lng, accuracy
       FROM incidents
      WHERE id=? LIMIT 1`, [incidentId]
  );
  const inc = rows[0];
  if (!inc) return { ok: false, code: 404, msg: 'Incidente no existe' };
  if (inc.citizen_id !== userId) return { ok: false, code: 403, msg: 'No es dueño del incidente' };
  return { ok: true, inc };
}

async function addLocation({ incidentId, userId, lat, lng, accuracy, ts }) {
  const check = await assertOwner(incidentId, userId);
  if (!check.ok) return check;

  let atExpr = 'NOW()';
  let atParam = [];
  if (ts) {
    const isMs = String(ts).length > 10;
    atExpr = 'FROM_UNIXTIME(?)';
    atParam = [isMs ? Math.floor(Number(ts) / 1000) : Number(ts)];
  }

  await pool.execute(
    `INSERT INTO incident_events (incident_id, type, at, by_user_id, payload_json, created_at)
     VALUES (?, 'LOCATION', ${atExpr}, ?, JSON_OBJECT('lat', ?, 'lng', ?, 'accuracy', ?), NOW())`,
    [incidentId, ...atParam, userId, lat, lng, accuracy || null]
  );

  await pool.execute(
    `UPDATE incidents
        SET lat=?, lng=?, accuracy=?, updated_at=NOW()
      WHERE id=?`,
    [lat, lng, accuracy || null, incidentId]
  );

  return { ok: true };
}

async function cancelIncident({ incidentId, userId, reason }) {
  const check = await assertOwner(incidentId, userId);
  if (!check.ok) return check;

  const st = check.inc.status;
  if (st === 'CLOSED' || st === 'CANCELED') {
    return { ok: false, code: 409, msg: 'Incidente ya finalizado' };
  }

  await pool.execute(
    `UPDATE incidents
        SET status='CANCELED', ended_at=NOW(), cancel_reason=?, updated_at=NOW()
      WHERE id=?`,
    [reason || null, incidentId]
  );

  await pool.execute(
    `INSERT INTO incident_events (incident_id, type, at, by_user_id, notes, created_at)
     VALUES (?, 'CANCEL', NOW(), ?, ?, NOW())`,
    [incidentId, userId, reason || null]
  );

  return { ok: true, status: 'CANCELED' };
}

async function getIncidentForUser(incidentId, userId) {
  const check = await assertOwner(incidentId, userId);
  if (!check.ok) return check;

  const inc = check.inc;

  const [evs] = await pool.execute(
    `SELECT at, JSON_EXTRACT(payload_json, '$.lat') AS lat,
            JSON_EXTRACT(payload_json, '$.lng') AS lng,
            JSON_EXTRACT(payload_json, '$.accuracy') AS accuracy
       FROM incident_events
      WHERE incident_id=? AND type='LOCATION'
      ORDER BY at DESC, id DESC
      LIMIT 1`,
    [incidentId]
  );

  const last = evs[0]
    ? {
        at: evs[0].at,
        lat: Number(evs[0].lat),
        lng: Number(evs[0].lng),
        accuracy: evs[0].accuracy != null ? Number(evs[0].accuracy) : null
      }
    : { at: inc.updated_at || inc.started_at, lat: inc.lat, lng: inc.lng, accuracy: inc.accuracy };

  return {
    ok: true,
    data: {
      id: incidentId,
      status: inc.status,
      started_at: inc.started_at,
      ended_at: inc.ended_at,
      last_location: last
    }
  };
}

module.exports = {
  createIncident,
  addLocation,
  cancelIncident,
  getIncidentForUser,
  createDemoIncident,
  updateSimulationStatus
};

/* ===================== SIMULACIONES ===================== */

// Crea (si no existe) un usuario + citizen ficticio para incidentes demo
async function ensureDemoCitizenId() {
  const email = process.env.SIM_DEMO_EMAIL || 'demo.sim@panic.local';
  // Verificar si ya existe usuario + citizen
  const [rows] = await pool.execute(
    `SELECT c.user_id AS citizen_id
       FROM users u
       JOIN citizens c ON c.user_id = u.id
      WHERE u.email=?
      LIMIT 1`, [email]
  );
  if (rows[0]) return rows[0].citizen_id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Evitar condición de carrera: volver a consultar dentro de la tx
    const [again] = await conn.execute(
      `SELECT c.user_id AS citizen_id
         FROM users u
         JOIN citizens c ON c.user_id = u.id
        WHERE u.email=?
        LIMIT 1`, [email]
    );
    if (again[0]) { await conn.commit(); return again[0].citizen_id; }

    const pwd = await bcrypt.hash('Simulation#123', 10);
    const [res] = await conn.execute(
      `INSERT INTO users (email, password_hash, role, status, must_change_password, created_at)
       VALUES (?, ?, 'unit', 'active', 0, NOW())`,
      [email, pwd]
    );
    const userId = res.insertId;
    await conn.execute(
      `INSERT INTO citizens (user_id, name)
       VALUES (?, ?)`,
      [userId, 'Demo Simulation']
    );
    await conn.commit();
    return userId;
  } catch (e) {
    try { await conn.rollback(); } catch(_){}
    // Si falla por duplicado (cond carrera) reintentar lectura
    if (e && e.code === 'ER_DUP_ENTRY') {
      const [r2] = await pool.execute(
        `SELECT c.user_id AS citizen_id
           FROM users u
           JOIN citizens c ON c.user_id = u.id
          WHERE u.email=?
          LIMIT 1`, [email]
      );
      if (r2[0]) return r2[0].citizen_id;
    }
    throw e;
  } finally {
    conn.release();
  }
}

async function createDemoIncident({ lat, lng, accuracy, battery, device }) {
  const citizenId = await ensureDemoCitizenId();
  const year = new Date().getFullYear();
  const seq = await nextFolio('incident', year);
  const incidentId = formatIncidentId(year, seq);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO incidents
        (id, citizen_id, priority, status, lat, lng, accuracy, init_battery, device_os, device_ver, is_demo, started_at)
       VALUES (?, ?, 3, 'SIMULATION', ?, ?, ?, ?, ?, ?, 1, NOW())`,
      [incidentId, citizenId, lat, lng, accuracy || null, battery || null, device?.os || null, device?.version || null]
    );
    await conn.execute(
      `INSERT INTO incident_events (incident_id, type, at, by_user_id, payload_json, created_at)
       VALUES (?, 'SIM_START', NOW(), NULL, JSON_OBJECT('lat', ?, 'lng', ?, 'accuracy', ?, 'battery', ?, 'device', JSON_OBJECT('os', ?, 'version', ?)), NOW())`,
      [incidentId, lat, lng, accuracy || null, battery || null, device?.os || null, device?.version || null]
    );
    await conn.commit();
    return { id: incidentId, status: 'SIMULATION' };
  } catch (e) {
    try { await conn.rollback(); } catch(_){ }
    throw e;
  } finally {
    conn.release();
  }
}

async function updateSimulationStatus({ incidentId, status }) {
  const [rows] = await pool.execute(
    `SELECT id, status FROM incidents WHERE id=? AND is_demo=1 LIMIT 1`,
    [incidentId]
  );
  const inc = rows[0];
  if (!inc) return { ok: false, code: 404, msg: 'Simulación no encontrada' };

  if (status === 'PAUSED') {
    if (inc.status !== 'SIMULATION') return { ok: false, code: 409, msg: 'No se puede pausar en el estado actual' };
    await pool.execute(`UPDATE incidents SET status='SIM_PAUSED', updated_at=NOW() WHERE id=?`, [incidentId]);
    await pool.execute(`INSERT INTO incident_events (incident_id, type, at, by_user_id, created_at) VALUES (?, 'SIM_PAUSE', NOW(), NULL, NOW())`, [incidentId]);
    return { ok: true, status: 'SIM_PAUSED' };
  }
  if (status === 'RUNNING') {
    if (inc.status !== 'SIM_PAUSED') return { ok: false, code: 409, msg: 'Solo se puede reanudar una simulación pausada' };
    await pool.execute(`UPDATE incidents SET status='SIMULATION', updated_at=NOW() WHERE id=?`, [incidentId]);
    await pool.execute(`INSERT INTO incident_events (incident_id, type, at, by_user_id, created_at) VALUES (?, 'SIM_RESUME', NOW(), NULL, NOW())`, [incidentId]);
    return { ok: true, status: 'SIMULATION' };
  }
  if (status === 'CLOSED') {
    if (inc.status === 'CLOSED') return { ok: true, status: 'CLOSED' };
    await pool.execute(`UPDATE incidents SET status='CLOSED', ended_at=NOW(), updated_at=NOW() WHERE id=?`, [incidentId]);
    await pool.execute(`INSERT INTO incident_events (incident_id, type, at, by_user_id, created_at) VALUES (?, 'SIM_END', NOW(), NULL, NOW())`, [incidentId]);
    return { ok: true, status: 'CLOSED' };
  }
  return { ok: false, code: 400, msg: 'Estado inválido' };
}

