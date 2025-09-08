const express = require('express');
const router = express.Router();
const { createDemo, updateDemoStatus } = require('../controllers/simulationsController');

/**
 * @swagger
 * tags:
 *   - name: Simulations
 *     description: "Creación y control de incidentes de simulación"
 */

/**
 * @swagger
 * /api/v1/simulations:
 *   post:
 *     summary: Crear incidente de simulación
 *     tags: [Simulations]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lat,lng]
 *             properties:
 *               lat: { type: number }
 *               lng: { type: number }
 *               accuracy: { type: number }
 *               battery: { type: number, minimum: 0, maximum: 100 }
 *               device: { type: object, properties: { os: { type: string }, version: { type: string } } }
 *     responses:
 *       201:
 *         description: Creado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 status: { type: string }
 */
router.post('/', createDemo);

/**
 * @swagger
 * /api/v1/simulations/{id}/status:
 *   patch:
 *     summary: Cambiar estado de simulación (PAUSED, RUNNING, CLOSED)
 *     tags: [Simulations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [PAUSED, RUNNING, CLOSED] }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 status: { type: string }
 */
router.patch('/:id/status', updateDemoStatus);

module.exports = { simulationsRouter: router };
