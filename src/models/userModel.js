const { pool } = require('../config/db');

async function findActiveByEmail(email) {
  const [rows] = await pool.execute(
    `SELECT id AS user_id, email, phone, password_hash, role, status, must_change_password
       FROM users WHERE email=? AND status="active" LIMIT 1`,
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
    `SELECT id AS user_id, email, full_name, phone, role, status, must_change_password, created_at, updated_at
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
    `INSERT INTO users (email, full_name, phone, password_hash, role, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.email, data.full_name || null, data.phone || null, data.password_hash, data.role, data.status || 'active']
  );
  return r.insertId;
}

async function updatePasswordById(userId, password_hash) {
  await pool.execute('UPDATE users SET password_hash=? WHERE id=?', [password_hash, userId]);
}

async function setTempPasswordAndForceChange(userId, password_hash) {
  await pool.execute('UPDATE users SET password_hash=?, must_change_password=1 WHERE id=?', [password_hash, userId]);
}

async function setPasswordAndClearForce(userId, password_hash) {
  await pool.execute('UPDATE users SET password_hash=?, must_change_password=0, password_changed_at=NOW() WHERE id=?', [password_hash, userId]);
}

async function updateStatusById(userId, status) {
  await pool.execute('UPDATE users SET status=? WHERE id=?', [status, userId]);
}

async function findById(id) {
  const [rows] = await pool.execute(
    'SELECT id AS user_id, email, full_name, phone, role, status, must_change_password FROM users WHERE id=? LIMIT 1',
    [id]
  );
  return rows[0];
}

// Perfil canónico para /me y /users/:id (lecturas unificadas)
// Canon: users.full_name; Compat (alias): name = full_name
async function getProfileById(id) {
  const [rows] = await pool.execute(
    `SELECT u.id AS user_id, u.email, u.full_name, u.phone, u.role, u.status, u.created_at,
            c.address, c.preferred_lang,
            (c.emergency_pin_hash IS NOT NULL) AS emergency_pin_set
       FROM users u
       LEFT JOIN citizens c ON c.user_id = u.id
      WHERE u.id=?
      LIMIT 1`,
    [id]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    user_id: r.user_id,
    id: r.user_id, // optional convenience
    full_name: r.full_name,
    name: r.full_name, // alias for legacy clients
    email: r.email,
    phone: r.phone,
    address: r.address || null,
    preferred_lang: r.preferred_lang || null,
    emergency_pin_set: !!r.emergency_pin_set,
    role: r.role,
    status: r.status,
    created_at: r.created_at
  };
}

async function getAuthById(id) {
  const [rows] = await pool.execute(
    'SELECT id AS user_id, email, password_hash, status, must_change_password FROM users WHERE id=? LIMIT 1',
    [id]
  );
  return rows[0];
}

async function emailExistsForOther(email, excludeId) {
  const [rows] = await pool.execute('SELECT 1 FROM users WHERE email=? AND id<>? LIMIT 1', [email, excludeId]);
  return rows.length > 0;
}

async function updateByIdPartial(id, { email, full_name, phone, role }) {
  const sets = [];
  const params = [];
  if (email !== undefined) { sets.push('email=?'); params.push(email); }
  if (full_name !== undefined) { sets.push('full_name=?'); params.push(full_name || null); }
  if (phone !== undefined) { sets.push('phone=?'); params.push(phone || null); }
  if (role !== undefined)  { sets.push('role=?');  params.push(role); }
  if (!sets.length) return null;
  const sql = `UPDATE users SET ${sets.join(', ')}, updated_at=NOW() WHERE id=?`;
  params.push(id);
  await pool.execute(sql, params);
  return await findById(id);
}

async function getUsersStats() {
  const [rows] = await pool.query(
    `SELECT
       COUNT(*)              AS total,
       SUM(status="active")   AS active,
       SUM(status="inactive") AS inactive,
       SUM(role="operator")   AS operators
     FROM users`
  );
  return rows[0] || { total: 0, active: 0, inactive: 0, operators: 0 };
}

module.exports = {
  findActiveByEmail,
  listUsers,
  emailExists,
  createUser,
  updatePasswordById,
  setTempPasswordAndForceChange,
  setPasswordAndClearForce,
  updateStatusById,
  findById,
  getAuthById,
  updateByIdPartial,
  emailExistsForOther,
  getUsersStats,
  getProfileById
};
