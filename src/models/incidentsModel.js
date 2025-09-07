const { pool } = require('../config/db');
const { nextFolio, formatIncidentId } = require('./idCounterModel');

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
  getIncidentForUser
};
