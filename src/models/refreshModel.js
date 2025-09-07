const { pool } = require('../config/db');

async function saveRefresh({ jti, userId, ttlDays, ip, ua }) {
  await pool.execute(
    `INSERT INTO refresh_tokens (jti, user_id, revoked, issued_at, expires_at, ip, user_agent)
     VALUES (?, ?, 0, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), ?, ?)`,
    [jti, userId, ttlDays, ip || null, ua || null]
  );
}

async function getRefresh(jti) {
  const [rows] = await pool.execute(
    `SELECT id, jti, user_id, revoked, issued_at, expires_at, replaced_by
       FROM refresh_tokens WHERE jti = ? LIMIT 1`,
    [jti]
  );
  return rows[0];
}

async function revokeRefresh(jti, replacedBy = null) {
  await pool.execute(`UPDATE refresh_tokens SET revoked=1, replaced_by=? WHERE jti=?`, [replacedBy, jti]);
}

async function revokeAllForUser(userId) {
  await pool.execute(`UPDATE refresh_tokens SET revoked=1 WHERE user_id=? AND revoked=0`, [userId]);
}

module.exports = { saveRefresh, getRefresh, revokeRefresh, revokeAllForUser };
