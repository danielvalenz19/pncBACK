const { pool } = require('../config/db');
const { maskCitizen } = require('../utils/mask');
const settings = require('./settingsModel');

function parseBbox(geo) { if (!geo) return null; const [lat1,lng1,lat2,lng2]=geo.split(',').map(Number); return { latMin:Math.min(lat1,lat2), latMax:Math.max(lat1,lat2), lngMin:Math.min(lng1,lng2), lngMax:Math.max(lng1,lng2) }; }

async function listIncidents({ status, from, to, geo, q, page=1, limit=50 }) {
  const where=['1=1']; const p=[];
  if (status){ where.push('i.status=?'); p.push(status); }
  if (from){ where.push('i.started_at>=?'); p.push(new Date(from)); }
  if (to){ where.push('i.started_at<?'); p.push(new Date(to)); }
  if (q){ where.push('(i.id LIKE ? OR u.email LIKE ? OR c.name LIKE ?)'); p.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  const bbox=parseBbox(geo); if (bbox){ where.push('(i.lat BETWEEN ? AND ?) AND (i.lng BETWEEN ? AND ?)'); p.push(bbox.latMin,bbox.latMax,bbox.lngMin,bbox.lngMax); }
  const off=(page-1)*limit; const whereSQL='WHERE '+where.join(' AND ');
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM incidents i LEFT JOIN citizens c ON c.user_id=i.citizen_id LEFT JOIN users u ON u.id=i.citizen_id ${whereSQL}`, p);
  const [rows] = await pool.query(`SELECT i.id, i.started_at AS created_at, i.status, i.lat, i.lng, i.accuracy, i.priority, i.init_battery AS battery FROM incidents i LEFT JOIN citizens c ON c.user_id=i.citizen_id LEFT JOIN users u ON u.id=i.citizen_id ${whereSQL} ORDER BY i.started_at DESC LIMIT ? OFFSET ?`, [...p, Number(limit), Number(off)]);
  return { items: rows, page, total };
}

async function getIncidentDetails(id) {
  const [[inc]] = await pool.query(`SELECT i.id, i.citizen_id, i.status, i.started_at, i.ended_at, i.lat, i.lng, i.accuracy, i.priority, i.init_battery, COALESCE(u.full_name, c.name) AS citizen_name, c.address AS citizen_address, u.email AS citizen_email, u.phone AS citizen_phone FROM incidents i LEFT JOIN citizens c ON c.user_id=i.citizen_id LEFT JOIN users u ON u.id=i.citizen_id WHERE i.id=? LIMIT 1`, [id]);
  if (!inc) return null;
  const [locations] = await pool.query(`SELECT at, CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.lat')) AS DECIMAL(10,6)) AS lat, CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.lng')) AS DECIMAL(10,6)) AS lng, CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.accuracy')) AS UNSIGNED) AS accuracy FROM incident_events WHERE incident_id=? AND type='LOCATION' ORDER BY at ASC, id ASC LIMIT 2000`, [id]);
  const [assignments] = await pool.query(`SELECT ia.id, ia.assigned_at, ia.accepted_at, ia.arrived_at, ia.cleared_at, u2.id AS unit_id, u2.name AS unit_name, u2.type AS unit_type, u2.plate FROM incident_assignments ia JOIN units u2 ON u2.id=ia.unit_id WHERE ia.incident_id=? ORDER BY ia.assigned_at ASC, ia.id ASC`, [id]);
  const [events] = await pool.query(`SELECT id, type, at, by_user_id AS actor_user_id, notes FROM incident_events WHERE incident_id=? AND type IN ('NEW','ACK','ASSIGN','STATUS','NOTE','CLOSE','CANCEL') ORDER BY at ASC, id ASC`, [id]);
  // Normalizar lista y calcular "last"; si no hay pings, caer a lat/lng del incidente
  const normLocs = (locations || []).map(l => ({
    lat: Number(l.lat),
    lng: Number(l.lng),
    accuracy: l.accuracy != null ? Number(l.accuracy) : null,
    at: l.at
  }));
  const lastFromEvents = normLocs.length ? normLocs[normLocs.length - 1] : null;
  const lastFromIncident = (inc.lat != null && inc.lng != null)
    ? { lat: Number(inc.lat), lng: Number(inc.lng), accuracy: inc.accuracy != null ? Number(inc.accuracy) : null, at: inc.started_at }
    : null;
  const currentLocation = lastFromEvents || lastFromIncident;
  // Keep existing masked citizen shape; add full details separately to avoid breaking consumers
  const citizenMasked = maskCitizen({ name: inc.citizen_name || null, email: inc.citizen_email || null, phone: inc.citizen_phone || null });
  const citizenFull = inc.citizen_id ? { id: inc.citizen_id, name: inc.citizen_name || null, phone: inc.citizen_phone || null, email: inc.citizen_email || null, address: inc.citizen_address || null } : null;
  return { id, citizen: citizenMasked, citizen_full: citizenFull, status: inc.status, started_at: inc.started_at, ended_at: inc.ended_at, locations: normLocs, currentLocation, assignments, events };
}

async function currentStatus(id) { const [[row]] = await pool.query(`SELECT status FROM incidents WHERE id=? LIMIT 1`, [id]); return row?.status || null; }

const assignments = require('./assignmentsModel');

async function ackIncident({ id, by }) { const st=await currentStatus(id); if(!st) return { ok:false, code:404, msg:'Incidente no existe' }; if(st!=='NEW') return { ok:false, code:409, msg:'Ya no está en NEW' }; await pool.execute(`UPDATE incidents SET status='ACK', updated_at=NOW() WHERE id=?`,[id]); await pool.execute(`INSERT INTO incident_events (incident_id, type, at, by_user_id, created_at) VALUES (?, 'ACK', NOW(), ?, NOW())`,[id,by]); return { ok:true }; }
const { rt } = require('../realtime/io');

async function assignUnit({ id, unitId, note, by }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const st = await currentStatus(id);
    if (!st) { await conn.rollback(); conn.release(); return { ok: false, code: 404, msg: 'Incidente no existe' }; }
    const [[u]] = await conn.query(`SELECT id, active FROM units WHERE id=? LIMIT 1`, [unitId]);
    if (!u) { await conn.rollback(); conn.release(); return { ok: false, code: 404, msg: 'Unidad no existe' }; }
    if (!u.active) { await conn.rollback(); conn.release(); return { ok: false, code: 409, msg: 'Unidad inactiva' }; }

    // 1) Crear (o ignorar si ya existe) asignación
    await conn.execute(`INSERT IGNORE INTO incident_assignments (incident_id, unit_id) VALUES (?, ?)`, [id, unitId]);

    // 2) Registrar evento ASSIGN
    await conn.execute(`INSERT INTO incident_events (incident_id, type, at, by_user_id, notes, payload_json, created_at) VALUES (?, 'ASSIGN', NOW(), ?, ?, JSON_OBJECT('unit_id', ?), NOW())`, [id, by, note || null, unitId]);

    // 3) Marcar incidente como despachado si aplica
    if (st === 'NEW' || st === 'ACK') {
      await conn.execute(`UPDATE incidents SET status='DISPATCHED', updated_at=NOW() WHERE id=?`, [id]);
    }

    // 4) La unidad pasa a "en_route"
    await conn.execute(`UPDATE units SET status = 'en_route' WHERE id = ?`, [unitId]);

    await conn.commit();

    // Notificar cambio de unidad (usamos el realtime exporter)
    try { rt.unitUpdate({ id: unitId, patch: { status: 'en_route' } }); } catch (_) {}

    return { ok: true };
  } catch (e) {
    try { await conn.rollback(); } catch (_e) {}
    throw e;
  } finally {
    conn.release();
  }
}
const allowedNext=new Set(['DISPATCHED','IN_PROGRESS','CLOSED']);
async function updateIncidentStatus({ id, status, reason, by }) {
  if (!allowedNext.has(status)) return { ok: false, code: 400, msg: 'Estado inválido' };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const st = await currentStatus(id);
    if (!st) { await conn.rollback(); conn.release(); return { ok: false, code: 404, msg: 'Incidente no existe' }; }
    const allowedFrom = { DISPATCHED: new Set(['NEW','ACK','DISPATCHED']), IN_PROGRESS: new Set(['DISPATCHED','IN_PROGRESS']), CLOSED: new Set(['IN_PROGRESS','DISPATCHED','ACK','NEW']) };
    if (!allowedFrom[status].has(st)) { await conn.rollback(); conn.release(); return { ok: false, code: 409, msg: `Transición ${st}→${status} no permitida` }; }

    await conn.execute(`UPDATE incidents SET status=?, updated_at=NOW(), ended_at=IF(?='CLOSED', NOW(), ended_at) WHERE id=?`, [status, status, id]);
    await conn.execute(`INSERT INTO incident_events (incident_id, type, at, by_user_id, notes, created_at) VALUES (?, 'STATUS', NOW(), ?, ?, NOW())`, [id, by, reason || null]);
    if (status === 'CLOSED') {
      await conn.execute(`INSERT INTO incident_events (incident_id, type, at, by_user_id, notes, created_at) VALUES (?, 'CLOSE', NOW(), ?, ?, NOW())`, [id, by, reason || null]);

  // Obtener unidades activas en este incidente
  const unitIds = await assignments.getActiveUnitIdsByIncident(conn, id);

  // Cerrar asignaciones activas
  await assignments.closeAssignmentsForIncident(conn, id);

      // Volver unidades a available
      if (unitIds.length) {
        await conn.query(`UPDATE units SET status = 'available' WHERE id IN (${unitIds.map(()=>'?').join(',')})`, unitIds);
      }

      await conn.commit();

      // Emitir actualizaciones por realtime
      try {
        rt.incidentUpdate(id, { status: 'CLOSED' });
        unitIds.forEach(uid => rt.unitUpdate({ id: uid, patch: { status: 'available' } }));
      } catch (_) {}

      return { ok: true };
    }

    await conn.commit();
    return { ok: true };
  } catch (e) {
    try { await conn.rollback(); } catch (_e) {}
    throw e;
  } finally {
    conn.release();
  }
}
async function addNote({ id, text, by }) { const st=await currentStatus(id); if(!st) return { ok:false, code:404, msg:'Incidente no existe' }; const [r] = await pool.execute(`INSERT INTO incident_events (incident_id, type, at, by_user_id, notes, created_at) VALUES (?, 'NOTE', NOW(), ?, ?, NOW())`,[id,by,text]); return { ok:true, data:{ id:r.insertId, at:new Date(), by } }; }
async function listUnits({ status, type }={}) { const where=['1=1']; const p=[]; if(status){ where.push('u.status=?'); p.push(status); } if(type){ where.push('u.type=?'); p.push(type); } const [rows] = await pool.query(`SELECT id, name, type, plate, status, active, lat, lng, last_seen FROM units u WHERE ${where.join(' AND ')} ORDER BY name ASC`,p); return rows; }
async function createUnit({ name, type, plate, active }) { const [r] = await pool.execute(`INSERT INTO units (name, type, plate, active, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'available', NOW(), NOW())`,[name,type,plate||null,active?1:0]); return r.insertId; }
async function updateUnit(id, data) { const fields=[]; const p=[]; for(const k of ['name','type','plate','status']) { if(data[k]!==undefined){ fields.push(`${k}=?`); p.push(data[k]||null); } } if(data.active!==undefined){ fields.push('active=?'); p.push(data.active?1:0); } if(!fields.length) return true; const [r] = await pool.execute(`UPDATE units SET ${fields.join(', ')}, updated_at=NOW() WHERE id=?`,[...p,id]); return r.affectedRows>0; }
async function listAudit({ actor, action, from, to, page=1, limit=50 }) { const where=['1=1']; const p=[]; if(actor){ where.push('who_user_id=?'); p.push(actor); } if(action){ where.push('action=?'); p.push(action); } if(from){ where.push('at>=?'); p.push(new Date(from)); } if(to){ where.push('at<?'); p.push(new Date(to)); } const whereSQL=where.join(' AND '); const off=(page-1)*limit; const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM audit_logs WHERE ${whereSQL}`,p); const [rows] = await pool.query(`SELECT id, who_user_id AS who, action, entity, entity_id, at, ip FROM audit_logs WHERE ${whereSQL} ORDER BY at DESC, id DESC LIMIT ? OFFSET ?`,[...p, Number(limit), Number(off)]); return { items: rows, page, total }; }
function pctile(arr,p){ if(!arr.length) return null; const idx=(arr.length-1)*p; const lo=Math.floor(idx), hi=Math.ceil(idx); if(lo===hi) return arr[lo]; return arr[lo]+(arr[hi]-arr[lo])*(idx-lo); }
async function getKpis(from,to){ const cfg=await settings.getAll(); const fromDt=new Date(from), toDt=new Date(to); const [ackRows] = await pool.query(`SELECT TIMESTAMPDIFF(SECOND, i.started_at, e.at) AS sec FROM incidents i JOIN incident_events e ON e.incident_id=i.id AND e.type='ACK' WHERE i.started_at >= ? AND i.started_at < ?`,[fromDt,toDt]); const [closeRows] = await pool.query(`SELECT TIMESTAMPDIFF(SECOND, i.started_at, i.ended_at) AS sec FROM incidents i WHERE i.status='CLOSED' AND i.started_at >= ? AND i.started_at < ? AND i.ended_at IS NOT NULL`,[fromDt,toDt]); const tta=ackRows.map(r=>Number(r.sec)).filter(n=>n>=0).sort((a,b)=>a-b); const ttr=closeRows.map(r=>Number(r.sec)).filter(n=>n>=0).sort((a,b)=>a-b); const tta_p50=pctile(tta,0.50), tta_p90=pctile(tta,0.90), tta_p95=pctile(tta,0.95); const ttr_p50=pctile(ttr,0.50), ttr_p90=pctile(ttr,0.90), ttr_p95=pctile(ttr,0.95); const slaThresh=Number(cfg.sla_ack_seconds ?? 60); const slaHits=tta.filter(s=>s<=slaThresh).length; const sla_pct=tta.length ? Math.round((slaHits/tta.length)*100) : null; const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM incidents WHERE started_at>=? AND started_at<?`,[fromDt,toDt]); const [[{ canceled }]] = await pool.query(`SELECT COUNT(*) AS canceled FROM incidents WHERE status='CANCELED' AND started_at>=? AND started_at<?`,[fromDt,toDt]); const cancellations_pct=total ? Math.round((Number(canceled)/Number(total))*100) : null; return { ttr:{ p50:ttr_p50, p90:ttr_p90, p95:ttr_p95 }, tta:{ p50:tta_p50, p90:tta_p90, p95:tta_p95 }, sla_pct, cancellations_pct }; }
function bucketExpr(groupBy) {
  switch (groupBy) {
    case 'week': return "YEARWEEK(i.started_at, 3)";
    case 'month': return "DATE_FORMAT(i.started_at,'%Y-%m')";
    default: return "DATE(i.started_at)";
  }
}

async function getResponseTimes(from, to, groupBy='day'){
  const bucket = bucketExpr(groupBy);
  const sql = `
    SELECT ${bucket} AS bucket,
           COUNT(*) AS incidents,
           AVG(TIMESTAMPDIFF(SECOND, i.started_at, a.ack_at))       AS avg_tta_sec,
           AVG(TIMESTAMPDIFF(SECOND, i.started_at, i.ended_at))     AS avg_duration_sec
      FROM incidents i
      LEFT JOIN (
        SELECT incident_id, MIN(at) AS ack_at
          FROM incident_events
         WHERE type='ACK'
         GROUP BY incident_id
      ) a ON a.incident_id = i.id
     WHERE i.started_at >= ? AND i.started_at < ?
     GROUP BY bucket
     ORDER BY bucket`;
  const [rows] = await pool.query(sql, [new Date(from), new Date(to)]);
  return rows;
}

async function getIncidentsByStatus(from, to){
  const [rows] = await pool.query(
    `SELECT i.status, COUNT(*) AS count
       FROM incidents i
      WHERE i.started_at >= ? AND i.started_at < ?
      GROUP BY i.status
      ORDER BY i.status`,
    [new Date(from), new Date(to)]
  );
  return rows;
}

async function getIncidentsVolume(from, to, groupBy='day'){
  const bucket = bucketExpr(groupBy);
  const [rows] = await pool.query(
    `SELECT ${bucket} AS bucket,
            COUNT(*)                                   AS created,
            SUM(i.status='CLOSED')                     AS closed
       FROM incidents i
      WHERE i.started_at >= ? AND i.started_at < ?
      GROUP BY bucket
      ORDER BY bucket`,
    [new Date(from), new Date(to)]
  );
  return rows;
}
module.exports = { listIncidents, getIncidentDetails, ackIncident, assignUnit, updateIncidentStatus, addNote, listUnits, createUnit, updateUnit, listAudit, getKpis,
  getResponseTimes, getIncidentsByStatus, getIncidentsVolume };


