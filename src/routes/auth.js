const express = require('express');
const { login, refresh, logout, register, changePassword, recoveryVerify, recoveryReset, me, updateMe } = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');

const authRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 */

authRouter.post('/register', register); // app ciudadanos
authRouter.post('/login', login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);

// perfil del usuario autenticado
/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current user's profile
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: integer, example: 123 }
 *                 user_id: { type: integer, example: 123 }
 *                 full_name: { type: string, example: "Juan Pérez" }
 *                 name: { type: string, example: "Juan Pérez", description: "Legacy alias of full_name" }
 *                 email: { type: string, example: "juan@example.com" }
 *                 phone: { type: string, example: "+50255551234" }
 *                 address: { type: string, nullable: true }
 *                 preferred_lang: { type: string, enum: [es, en], nullable: true }
 *                 emergency_pin_set: { type: boolean, example: true }
 *                 role: { type: string, example: "citizen" }
 *                 status: { type: string, example: "active" }
 *                 created_at: { type: string, format: date-time }
 */
authRouter.get('/me', authenticate, me);

/**
 * @swagger
 * /api/v1/auth/me:
 *   patch:
 *     summary: Update current user's profile
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string, example: "Juan A. Pérez" }
 *               name: { type: string, description: "Legacy alias for full_name" }
 *               phone: { type: string, example: "+50255551234" }
 *               address: { type: string, example: "Zona 10, Guatemala" }
 *               preferred_lang: { type: string, enum: [es, en] }
 *     responses:
 *       200:
 *         description: OK
 */
authRouter.patch('/me', authenticate, updateMe);

/**
 * @swagger
 * /api/v1/me:
 *   get:
 *     summary: Get current user's profile (alias)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: OK
 */

// cambio de contraseña autenticado
/**
 * @swagger
 * /api/v1/auth/change-password:
 *   post:
 *     summary: Change password (logged user)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               current_password: { type: string }
 *               new_password: { type: string }
 *     responses:
 *       204: { description: No Content }
 */
authRouter.post('/change-password', authenticate, changePassword);

// Recuperación sin email/SMS (KBA: pin|dpi|phone_last4)
authRouter.post('/recovery/verify', recoveryVerify);
authRouter.post('/recovery/reset', recoveryReset);

module.exports = { authRouter };
