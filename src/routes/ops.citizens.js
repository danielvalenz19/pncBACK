const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();

// KPIs/estadísticas para cards + serie del gráfico
router.get('/stats', async (req, res, next) => {
  try {
    // Ventana temporal (últimos 30 días por defecto)
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 30);

    // Totales (ajustado a nuestro esquema: status 'inactive' en lugar de 'blocked')
    const [totRows] = await pool.query(
      `
      SELECT
        SUM(role='citizen') AS total_ciudadanos,
        SUM(role='citizen' AND status='active')   AS activos,
        SUM(role='citizen' AND status='inactive') AS bloqueados,
        SUM(role='citizen' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS nuevos_30d
      FROM users;
      `
    );

    // Serie diaria (n y acumulado) en rango inclusivo
    const [serie] = await pool.query(
      `
      SELECT d AS date, n,
             SUM(n) OVER (ORDER BY d) AS acumulado
      FROM (
        SELECT DATE(created_at) AS d, COUNT(*) AS n
        FROM users
        WHERE role='citizen' AND created_at BETWEEN ? AND ?
        GROUP BY DATE(created_at)
      ) AS diarios
      ORDER BY d;
      `,
      [from, to]
    );

    const tot = totRows && totRows[0] ? totRows[0] : {};
    res.json({
      total: Number(tot.total_ciudadanos || 0),
      activos: Number(tot.activos || 0),
      bloqueados: Number(tot.bloqueados || 0),
      nuevos_30d: Number(tot.nuevos_30d || 0),
      diarios: Array.isArray(serie) ? serie : [],
    });
  } catch (err) {
    next(err);
  }
});

// Listado paginado + filtros q/status
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;
    const q = (req.query.q || '').toString();
    const status = (req.query.status || '').toString();

    const params = [];
    let where = `u.role='citizen'`;
    if (status) {
      where += ` AND u.status = ?`;
      params.push(status);
    }
    if (q) {
      where += ` AND (c.name LIKE CONCAT('%',?,'%') OR u.email LIKE CONCAT('%',?,'%'))`;
      params.push(q, q);
    }

    const [items] = await pool.query(
      `
      SELECT
        u.id, u.email, u.phone, u.status, u.created_at,
        c.name, c.dpi, c.address,
        (SELECT COUNT(*) FROM incidents i WHERE i.citizen_id = u.id) AS incidents_count,
        (SELECT MAX(started_at) FROM incidents i WHERE i.citizen_id = u.id) AS last_incident_at
      FROM users u
      LEFT JOIN citizens c ON c.user_id = u.id
      WHERE ${where}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?;
      `,
      [...params, limit, offset]
    );

    const [[totalRow]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM users u
      LEFT JOIN citizens c ON c.user_id = u.id
      WHERE ${where};
      `,
      params
    );

    res.json({
      items,
      total: Number(totalRow?.total || 0),
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

