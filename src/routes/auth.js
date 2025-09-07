const express = require('express');
const { login, refresh, logout, register, recoveryVerify, recoveryReset } = require('../controllers/authController');

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

// Recuperación sin email/SMS (KBA: pin|dpi|phone_last4)
authRouter.post('/recovery/verify', recoveryVerify);
authRouter.post('/recovery/reset', recoveryReset);

module.exports = { authRouter };
