const express = require('express');
const ctrl = require('../controllers/incidentsController');

const incidentsRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Incidents
 *   description: "App móvil (ciudadano) (roles: unit, admin)"
 */

/**
 * @swagger
 * /api/v1/incidents:
 *   post:
 *     summary: Crear incidente
 *     tags: [Incidents]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/IncidentCreate'
 *           example:
 *             lat: 14.6123
 *             lng: -90.5354
 *             accuracy: 8
 *             battery: 72
 *             device: { os: android, version: '14' }
 *     responses:
 *       201:
 *         description: Creado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/IncidentCreated' }
 *       400: { description: Bad request }
 */
incidentsRouter.post('/', ctrl.create);

/**
 * @swagger
 * /api/v1/incidents/{id}/location:
 *   post:
 *     summary: Ping de ubicación
 *     tags: [Incidents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema: { type: string }
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LocationPing' }
 *           example:
 *             lat: 14.6125
 *             lng: -90.535
 *             accuracy: 6
 *             ts: 1725700000
 *     responses:
 *       202:
 *         description: Aceptado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LocationAccepted' }
 *       400: { description: Bad request }
 *       403: { description: Forbidden }
 *       404: { description: Incidente no existe }
 */
incidentsRouter.post('/:id/location', ctrl.pushLocation);

/**
 * @swagger
 * /api/v1/incidents/{id}/cancel:
 *   post:
 *     summary: Cancelar incidente
 *     tags: [Incidents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema: { type: string }
 *         required: true
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CancelIncidentRequest' }
 *           example: { reason: 'falsa alarma' }
 *     responses:
 *       200:
 *         description: Cancelado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: CANCELED }
 *       404: { description: Incidente no existe }
 *       409: { description: Ya finalizado }
 */
incidentsRouter.post('/:id/cancel', ctrl.cancel);

/**
 * @swagger
 * /api/v1/incidents/{id}:
 *   get:
 *     summary: Ver estado del incidente
 *     tags: [Incidents]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema: { type: string }
 *         required: true
 *     responses:
 *       200:
 *         description: Estado
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/IncidentStatus' }
 *       404: { description: Incidente no existe }
 */
incidentsRouter.get('/:id', ctrl.getOne);

module.exports = { incidentsRouter };
