const express = require('express');
const Joi = require('joi');

const { requireRole } = require('../middlewares/auth');
const { list } = require('../controllers/usersController');
const { normalizeGT } = require('../utils/phone');
const { updateByIdPartial } = require('../models/userModel');
const { updateCitizenNameByUserId } = require('../models/citizenModel');

const usersRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management
 */

// Solo ADMIN puede listar usuarios
usersRouter.get('/', requireRole('admin'), list);

const updateSelfSchema = Joi.object({
  name: Joi.string().min(2).max(120).optional(),
  full_name: Joi.string().min(2).max(120).optional(),
  phone: Joi.string().allow(null, '').optional()
}).min(1);

async function updateSelf(req, res, next) {
  try {
    const { value, error } = updateSelfSchema.validate(req.body || {});
    if (error) return res.status(400).json({ error: 'BadRequest', message: error.message });

    const userId = req.user?.user_id ?? req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized', message: 'Usuario no autenticado' });

    const fullName = value.full_name ?? value.name;
    const normalizedPhone = value.phone !== undefined ? normalizeGT(value.phone) : undefined;

    const patch = {};
    if (fullName !== undefined) patch.full_name = fullName;
    if (value.phone !== undefined) patch.phone = normalizedPhone;

    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'BadRequest', message: 'Nada para actualizar' });
    }

    await updateByIdPartial(userId, patch);

    if (fullName !== undefined) {
      try {
        await updateCitizenNameByUserId(userId, fullName);
      } catch (_) {
        // Optional mirror, ignore failures to avoid blocking profile updates
      }
    }

    return res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * @swagger
 * /api/v1/users/me:
 *   put:
 *     summary: Update current user's profile (name/phone)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "María López"
 *               full_name:
 *                 type: string
 *                 description: Canonical name field (takes precedence over name)
 *               phone:
 *                 type: string
 *                 example: "+50255551234"
 *     responses:
 *       204:
 *         description: No Content
 *   patch:
 *     summary: Update current user's profile (name/phone)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               full_name:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       204:
 *         description: No Content
 */
usersRouter.put('/me', updateSelf);
usersRouter.patch('/me', updateSelf);

module.exports = { usersRouter };
