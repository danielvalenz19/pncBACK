const { pool } = require('../config/db');

async function getActiveIncidentIdByUnit(connOrPool, unitId) {
  const [rows] = await connOrPool.execute(
    `SELECT incident_id
       FROM incident_assignments
      WHERE unit_id = ? AND cleared_at IS NULL
      ORDER BY assigned_at DESC, id DESC
      LIMIT 1`,
    [unitId]
  );
  return rows.length ? rows[0].incident_id : null;
}

async function getActiveUnitIdsByIncident(connOrPool, incidentId) {
  const [rows] = await connOrPool.execute(
    `SELECT unit_id
       FROM incident_assignments
      WHERE incident_id = ? AND cleared_at IS NULL`,
    [incidentId]
  );
  return rows.map(r => r.unit_id);
}

async function closeAssignmentsForIncident(conn, incidentId) {
  await conn.execute(
    `UPDATE incident_assignments SET cleared_at = NOW()
      WHERE incident_id = ? AND cleared_at IS NULL`,
    [incidentId]
  );
}

async function closeAssignmentsForUnit(conn, unitId) {
  await conn.execute(
    `UPDATE incident_assignments SET cleared_at = NOW()
      WHERE unit_id = ? AND cleared_at IS NULL`,
    [unitId]
  );
}

module.exports = {
  getActiveIncidentIdByUnit,
  getActiveUnitIdsByIncident,
  closeAssignmentsForIncident,
  closeAssignmentsForUnit,
};
