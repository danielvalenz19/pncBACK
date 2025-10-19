const express = require('express');
const { requireRole } = require('../middlewares/auth');
const ctrl = require('../controllers/adminUsersController');

const adminRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Staff management (admin only)
 */

// Crear staff (operator/supervisor/admin/unit)
/**
 * @swagger
 * /api/v1/admin/users:
 *   post:
 *     summary: Create staff user (admin)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *               name: { type: string }
 *               role: { type: string, enum: [admin,operator,supervisor,unit] }
 *               phone: { type: string }
 *     responses:
 *       201: { description: Created }
 */
adminRouter.post('/users', requireRole('admin'), ctrl.createStaff);

// Listado y KPIs
adminRouter.get('/users/stats', requireRole('admin'), ctrl.stats);
adminRouter.get('/users', requireRole('admin'), ctrl.list);

/**
 * @swagger
 * /api/v1/admin/users/{id}:
 *   get:
 *     summary: Get user by id (admin)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 */
adminRouter.get('/users/:id', requireRole('admin'), ctrl.getById);

/**
 * @swagger
 * /api/v1/admin/users/{id}/reset-password:
 *   post:
 *     summary: Reset password for staff user (admin)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: No Content }
 */
adminRouter.post('/users/:id/reset-password', requireRole('admin'), ctrl.resetPassword);

/**
 * @swagger
 * /api/v1/admin/users/{id}/status:
 *   patch:
 *     summary: Update user status (admin)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active,inactive]
 *     responses:
 *       204: { description: No Content }
 */
adminRouter.patch('/users/:id/status', requireRole('admin'), ctrl.updateStatus);

/**
 * @swagger
 * /api/v1/admin/users/{id}:
 *   patch:
 *     summary: Update user fields (admin)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *               phone: { type: string }
 *               role:  { type: string, enum: [admin,operator,supervisor,unit] }
 *     responses:
 *       200: { description: OK }
 */
adminRouter.patch('/users/:id', requireRole('admin'), ctrl.update);

module.exports = { adminRouter };
