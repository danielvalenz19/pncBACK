const express = require('express');
const { login, refresh, logout, register, changePassword, recoveryVerify, recoveryReset, me } = require('../controllers/authController');
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
authRouter.get('/me', authenticate, me);

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
