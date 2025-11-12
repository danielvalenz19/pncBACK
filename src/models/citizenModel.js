const { pool } = require('../config/db');

async function createCitizen(conn, data) {
  const executor = conn || pool;
  await executor.execute(
    `INSERT INTO citizens (user_id, name, dpi, address, emergency_pin_hash)
     VALUES (?, ?, ?, ?, ?)`,
    [data.user_id, data.name, data.dpi || null, data.address || null, data.emergency_pin_hash]
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

async function getCitizenById(userId) {
  const [rows] = await pool.execute(
    `SELECT u.id AS user_id, u.email, u.phone, u.status, u.role,
            c.name, c.dpi, c.address, c.created_at, c.updated_at
     FROM users u
     LEFT JOIN citizens c ON c.user_id=u.id
     WHERE u.id=? AND u.role='citizen' LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function updateCitizenNameByUserId(userId, name) {
  await pool.execute(
    'UPDATE citizens SET name=?, updated_at=NOW() WHERE user_id=?',
    [name || null, userId]
  );
}

module.exports = {
  createCitizen,
  getKbaDataByEmail,
  getCitizenById,
  updateCitizenNameByUserId
};
