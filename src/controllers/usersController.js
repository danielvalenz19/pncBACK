const Joi = require('joi');
const { listUsers } = require('../models/userModel');
// Validation schema for listing users
const listSchema = Joi.object({
  q: Joi.string().allow(''),
  role: Joi.string().valid('admin','operator','supervisor','unit'),
  status: Joi.string().valid('active','inactive'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: List users (admin only)
 *     tags:
 *       - Users
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin,operator,supervisor,unit]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active,inactive]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 meta:
 *                   type: object
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 */
async function list(req, res, next) {
  try {
    const { value, error } = listSchema.validate(req.query);
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });
    const { total, rows } = await listUsers(value);
    res.json({ meta: { page: value.page, limit: value.limit, total }, data: rows });
  } catch (err) { next(err); }
}

module.exports = { list };
