const { pool } = require('../config/db');

async function findActiveByEmail(email) {
  const [rows] = await pool.execute(
    'SELECT id AS user_id, email, phone, password_hash, role, status FROM users WHERE email=? AND status="active" LIMIT 1',
    [email]
  );
  return rows[0];
}

async function listUsers({ q, role, status, limit = 20, page = 1 }) {
  const where = ['1=1'];
  const params = [];
  if (q) { where.push('(email LIKE ? OR phone LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (role) { where.push('role=?'); params.push(role); }
  if (status) { where.push('status=?'); params.push(status); }
  const whereSQL = 'WHERE ' + where.join(' AND ');
  const off = (page - 1) * limit;

  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) total FROM users ${whereSQL}`, params);
  const [rows] = await pool.query(
    `SELECT id AS user_id, email, phone, role, status, created_at, updated_at
       FROM users ${whereSQL}
       ORDER BY id
       LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(off)]
  );
  return { total, rows };
}

module.exports = { findActiveByEmail, listUsers };
