const { pool } = require('../config/db');

async function createCitizen(conn, data) {
  const executor = conn || pool;
  await executor.execute(
    `INSERT INTO citizens (user_id, name, emergency_pin_hash)
     VALUES (?, ?, ?)`,
    [data.user_id, data.name, data.emergency_pin_hash]
  );
}

async function getKbaDataByEmail(email) {
  const [rows] = await pool.execute(
    `SELECT u.id AS user_id, u.email, u.phone, u.status, c.emergency_pin_hash, c.dpi
       FROM users u
       JOIN citizens c ON c.user_id = u.id
      WHERE u.email = ?
      LIMIT 1`,
    [email]
  );
  return rows[0];
}

module.exports = { createCitizen, getKbaDataByEmail };
