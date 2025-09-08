const express = require('express');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Realtime
 *   description: "Eventos Socket.IO y sus payloads. Conéctate vía Socket.IO al mismo host y envía auth.token con tu JWT."
 */

/**
 * @swagger
 * /api/v1/realtime/events:
 *   get:
 *     summary: Listado de eventos Socket.IO soportados
 *     tags: [Realtime]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Lista de eventos y descripción
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscribe:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name: { type: string }
 *                       description: { type: string }
 *                       ack_schema: { $ref: '#/components/schemas/RealtimeSubscriptionAck' }
 *                 publish:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name: { type: string }
 *                       room: { type: string }
 *                       payload_schema: { type: string }
 *                       description: { type: string }
 */
router.get('/events', (_req, res) => {
  res.json({
    subscribe: [
      { name: 'subscribe:ops', description: 'Suscribirse a sala de operación (roles: admin, operator, supervisor)', ack_schema: 'RealtimeSubscriptionAck' },
      { name: 'subscribe:incident', description: 'Suscribirse a una sala específica de incidente (roles ops o dueño)', ack_schema: 'RealtimeSubscriptionAck' }
    ],
    publish: [
      { name: 'incidents:new', room: 'ops', payload_schema: 'RealtimeIncidentNew', description: 'Nuevo incidente creado' },
      { name: 'incidents:update', room: 'ops', payload_schema: 'RealtimeIncidentsUpdate', description: 'Patch de incidente para portal ops' },
      { name: 'incident:update', room: 'incident:<id>', payload_schema: 'RealtimeIncidentUpdateSingle', description: 'Patch de incidente individual para apps/cliente suscrito' },
      { name: 'units:update', room: 'ops', payload_schema: 'RealtimeUnitUpdate', description: 'Actualización estado/heartbeat unidad' },
      { name: 'geo:update', room: 'ops', payload_schema: 'RealtimeGeoUpdate', description: 'Evento opcional de geocerca (si se emite)' }
    ]
  });
});

module.exports = { realtimeRouter: router };
