const express = require('express');
const { requireRole } = require('../middlewares/auth');
const { list } = require('../controllers/usersController');

const usersRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management
 */

// Solo ADMIN puede listar usuarios
usersRouter.get('/', requireRole('admin'), list);

module.exports = { usersRouter };
