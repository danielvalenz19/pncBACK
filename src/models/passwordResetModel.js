const { pool } = require('../config/db');

async function recordAttempt({ email, method, success, ip, meta }) {
  await pool.execute(
    `INSERT INTO password_reset_attempts (user_email, method, success, ip, meta_json)
     VALUES (?, ?, ?, ?, ?)`,
    [email, method, success ? 1 : 0, ip || null, JSON.stringify(meta || {})]
  );
}

module.exports = { recordAttempt };
