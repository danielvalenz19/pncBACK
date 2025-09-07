const { pool } = require('../config/db');

async function nextFolio(name, year) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO id_counters(name, year, value)
       VALUES (?, ?, 0)
       ON DUPLICATE KEY UPDATE value = value`,
      [name, year]
    );

    await conn.execute(
      `UPDATE id_counters SET value = value + 1 WHERE name=? AND year=?`,
      [name, year]
    );
    const [[row]] = await conn.query(
      `SELECT value FROM id_counters WHERE name=? AND year=?`,
      [name, year]
    );

    await conn.commit();
    return row.value;
  } catch (e) {
    try { await conn.rollback(); } catch(_){}
    throw e;
  } finally {
    conn.release();
  }
}

function formatIncidentId(year, seq) {
  const n = String(seq).padStart(6, '0');
  return `INC-${year}-${n}`;
}

module.exports = { nextFolio, formatIncidentId };
