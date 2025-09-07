const express = require('express');
const { login, refresh, logout } = require('../controllers/authController');

const authRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 */

authRouter.post('/login', login);
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);

module.exports = { authRouter };
