const express = require('express');
const ctrl = require('../controllers/devicesController');

const devicesRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Devices
 *   description: "Registro de tokens FCM (roles: citizen, unit, admin)"
 */

/**
 * @swagger
 * /api/v1/devices:
 *   post:
 *     summary: Registrar dispositivo FCM
 *     tags: [Devices]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/DeviceRegister' }
 *           example: { platform: android, fcm_token: 'AAAABBBBCCCC...' }
 *     responses:
 *       201:
 *         description: Registrado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/DeviceRegistered' }
 *       400: { description: Bad request }
 */
devicesRouter.post('/', ctrl.register);

/**
 * @swagger
 * /api/v1/devices/{deviceId}:
 *   delete:
 *     summary: Eliminar registro FCM
 *     tags: [Devices]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         schema: { type: integer }
 *         required: true
 *     responses:
 *       204: { description: Eliminado }
 *       404: { description: No encontrado }
 */
devicesRouter.delete('/:deviceId', ctrl.remove);

module.exports = { devicesRouter };
