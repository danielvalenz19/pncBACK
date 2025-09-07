const { pool } = require('../config/db');

async function registerDevice({ userId, platform, fcmToken }) {
  await pool.execute(
    `INSERT INTO devices (user_id, platform, fcm_token, active, created_at, updated_at)
     VALUES (?, ?, ?, 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), platform=VALUES(platform), active=1, updated_at=NOW()`,
    [userId, platform, fcmToken]
  );
  const [[row]] = await pool.query(
    `SELECT id FROM devices WHERE fcm_token=? LIMIT 1`,
    [fcmToken]
  );
  return row?.id;
}

async function deleteDevice({ userId, deviceId }) {
  const [rows] = await pool.execute(
    `SELECT id FROM devices WHERE id=? AND user_id=? LIMIT 1`,
    [deviceId, userId]
  );
  if (!rows[0]) return false;

  await pool.execute(`DELETE FROM devices WHERE id=?`, [deviceId]);
  return true;
}

module.exports = { registerDevice, deleteDevice };
