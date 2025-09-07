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
  if (q)    { where.push('(email LIKE ? OR phone LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
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

/* ---- nuevas utilidades ---- */
async function emailExists(email) {
  const [rows] = await pool.execute('SELECT 1 FROM users WHERE email=? LIMIT 1', [email]);
  return rows.length > 0;
}

async function createUser(conn, data) {
  const executor = conn || pool;
  const [r] = await executor.execute(
    `INSERT INTO users (email, phone, password_hash, role, status)
     VALUES (?, ?, ?, ?, ?)`,
    [data.email, data.phone || null, data.password_hash, data.role, data.status || 'active']
  );
  return r.insertId;
}

async function updatePasswordById(userId, password_hash) {
  await pool.execute('UPDATE users SET password_hash=? WHERE id=?', [password_hash, userId]);
}

async function updateStatusById(userId, status) {
  await pool.execute('UPDATE users SET status=? WHERE id=?', [status, userId]);
}

async function findById(id) {
  const [rows] = await pool.execute(
    'SELECT id AS user_id, email, phone, role, status FROM users WHERE id=? LIMIT 1',
    [id]
  );
  return rows[0];
}

module.exports = {
  findActiveByEmail,
  listUsers,
  emailExists,
  createUser,
  updatePasswordById,
  updateStatusById,
  findById
};
