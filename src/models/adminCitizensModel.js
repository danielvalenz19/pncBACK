const { pool } = require('../config/db');

// --- KPIs + serie diaria ---
async function getStats({ from, to }) {
  // KPIs
  const [[kpis]] = await pool.query(`
    SELECT
      SUM(role='citizen')                                         AS total_ciudadanos,
      SUM(role='citizen' AND status='active')                     AS ciudadanos_activos,
      SUM(role='citizen' AND status='inactive')                   AS ciudadanos_bloqueados,
      SUM(role='citizen' AND created_at >= NOW() - INTERVAL 30 DAY) AS nuevos_30d
    FROM users
  `);

  // activos por uso (incidentes últimos 30 días)
  const [[activos30d]] = await pool.query(`
    SELECT COUNT(DISTINCT i.citizen_id) AS activos_30d
    FROM incidents i
    WHERE i.started_at >= NOW() - INTERVAL 30 DAY
  `);

  // Serie de nuevos ciudadanos por día (rango inclusivo)
  const [series] = await pool.query(`
    WITH diarios AS (
      SELECT DATE(u.created_at) AS d, COUNT(*) AS n
      FROM users u
      WHERE u.role = 'citizen'
        AND u.created_at >= ?
        AND u.created_at < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY DATE(u.created_at)
    )
    SELECT d, n, SUM(n) OVER (ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acumulado
    FROM diarios
    ORDER BY d
  `, [from, to]);

  return { kpis: { ...kpis, activos_30d: activos30d?.activos_30d || 0 }, series };
}

// --- Listado paginado + filtros ---
async function listCitizens({ q, status, page=1, limit=20 }) {
  const offset = (page - 1) * limit;

  const [rows] = await pool.query(`
    SELECT
      u.id, u.email, u.phone, u.status, u.created_at,
      c.name, c.dpi, c.address,
      (SELECT COUNT(*) FROM incidents i WHERE i.citizen_id = u.id)  AS incidents_count,
      (SELECT MAX(i.started_at) FROM incidents i WHERE i.citizen_id = u.id) AS last_incident_at
    FROM users u
    LEFT JOIN citizens c ON c.user_id = u.id
    WHERE u.role='citizen'
      AND (? IS NULL OR u.status = ?)
      AND (? IS NULL OR c.name LIKE CONCAT('%',?,'%') OR u.email LIKE CONCAT('%',?,'%'))
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `, [status, status, q, q, q, limit, offset]);

  const [[count]] = await pool.query(`
    SELECT COUNT(*) AS total
    FROM users u
    LEFT JOIN citizens c ON c.user_id = u.id
    WHERE u.role='citizen'
      AND (? IS NULL OR u.status = ?)
      AND (? IS NULL OR c.name LIKE CONCAT('%',?,'%') OR u.email LIKE CONCAT('%',?,'%'))
  `, [status, status, q, q, q]);

  return { rows, total: count.total, page, limit };
}

// --- Perfil + últimos incidentes ---
async function getCitizenById(id) {
  const [[c]] = await pool.query(`
    SELECT u.id, u.email, u.phone, u.status, u.created_at,
           c.name, c.dpi, c.address, c.birthdate, c.preferred_lang
    FROM users u
    LEFT JOIN citizens c ON c.user_id = u.id
    WHERE u.id=? AND u.role='citizen'
  `, [id]);

  const [incidents] = await pool.query(`
    SELECT id, status, started_at, ended_at, priority
    FROM incidents
    WHERE citizen_id=?
    ORDER BY started_at DESC
    LIMIT 50
  `, [id]);

  return { citizen: c, incidents };
}

// --- Edición básica (name/email/phone/address) ---
async function updateCitizen(id, { name, email, phone, address }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (email != null || phone != null) {
      await conn.query(
        `UPDATE users SET email=COALESCE(?,email), phone=COALESCE(?,phone), updated_at=NOW()
         WHERE id=? AND role='citizen'`,
        [email, phone, id]
      );
    }
    if (name != null || address != null) {
      await conn.query(
        `UPDATE citizens SET name=COALESCE(?,name), address=COALESCE(?,address), updated_at=NOW()
         WHERE user_id=?`,
        [name, address, id]
      );
    }
    await conn.commit();
    return true;
  } catch (e) {
    try { await conn.rollback(); } catch(_){ }
    throw e;
  } finally {
    conn.release();
  }
}

// --- Activar/Bloquear ---
async function updateCitizenStatus(id, status) {
  const [r] = await pool.query(
    `UPDATE users SET status=?, updated_at=NOW() WHERE id=? AND role='citizen'`,
    [status, id]
  );
  return r.affectedRows > 0;
}

module.exports = {
  getStats, listCitizens, getCitizenById, updateCitizen, updateCitizenStatus
};

