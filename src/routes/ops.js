const express = require('express');
const incidents = require('../controllers/ops/incidentsOpsController');
const units = require('../controllers/ops/unitsOpsController');
const reports = require('../controllers/ops/reportsController');
const audit = require('../controllers/ops/auditController');
const settings = require('../controllers/ops/settingsController');

const opsRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Ops
 *   description: "Portal Operación/Despacho (roles: operator, supervisor, admin)"
 */

/**
 * @swagger
 * /api/v1/ops/incidents:
 *   get:
 *     summary: Listar incidentes
 *     tags: [Ops]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Lista
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/OpsIncidentListResponse' }
 */
// INCIDENTES
opsRouter.get('/incidents', incidents.list);
/**
 * @swagger
 * /api/v1/ops/incidents/{id}:
 *   get:
 *     summary: Detalle incidente
 *     tags: [Ops]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema: { type: string }
 *         required: true
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/OpsIncidentDetail' } } } }
 *       404: { description: No encontrado }
 */
opsRouter.get('/incidents/:id', incidents.getOne);
/**
 * @swagger
 * /api/v1/ops/incidents/{id}/ack:
 *   patch:
 *     summary: ACK incidente
 *     tags: [Ops]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema: { type: string }
 *         required: true
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { status: { type: string, example: ACK } } } } } }
 */
opsRouter.patch('/incidents/:id/ack', incidents.ack);
/**
 * @swagger
 * /api/v1/ops/incidents/{id}/assign:
 *   patch:
 *     summary: Asignar unidad
 *     tags: [Ops]
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
 *           schema: { $ref: '#/components/schemas/OpsAssignRequest' }
 *     responses:
 *       200: { description: OK }
 */
opsRouter.patch('/incidents/:id/assign', incidents.assign);
/**
 * @swagger
 * /api/v1/ops/incidents/{id}/status:
 *   patch:
 *     summary: Cambiar estado
 *     tags: [Ops]
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
 *           schema: { $ref: '#/components/schemas/OpsStatusRequest' }
 *     responses:
 *       200: { description: OK }
 */
opsRouter.patch('/incidents/:id/status', incidents.setStatus);
/**
 * @swagger
 * /api/v1/ops/incidents/{id}/notes:
 *   post:
 *     summary: Agregar nota
 *     tags: [Ops]
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
 *           schema: { $ref: '#/components/schemas/OpsNoteRequest' }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/OpsNoteResponse' } } } }
 */
opsRouter.post('/incidents/:id/notes', incidents.addNote);

// UNIDADES
/**
 * @swagger
 * /api/v1/ops/units:
 *   get:
 *     summary: Listar unidades
 *     tags: [Ops]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Unit' } } } } }
 */
opsRouter.get('/units', units.list);
/**
 * @swagger
 * /api/v1/ops/units:
 *   post:
 *     summary: Crear unidad
 *     tags: [Ops]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UnitCreateRequest' }
 *     responses:
 *       201: { description: Creada, content: { application/json: { schema: { type: object, properties: { id: { type: integer } } } } } }
 */
opsRouter.post('/units', units.create);
/**
 * @swagger
 * /api/v1/ops/units/{id}:
 *   patch:
 *     summary: Actualizar unidad
 *     tags: [Ops]
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
 *           schema: { $ref: '#/components/schemas/UnitUpdateRequest' }
 *     responses:
 *       204: { description: Actualizada }
 */
opsRouter.patch('/units/:id', units.update);

// REPORTES / AUDITORÍA / SETTINGS
/**
 * @swagger
 * /api/v1/ops/reports/kpis:
 *   get:
 *     summary: KPIs operación
 *     tags: [Ops]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         required: true
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/Kpis' } } } }
 */
opsRouter.get('/reports/kpis', reports.kpis);
/**
 * @swagger
 * /api/v1/ops/audit:
 *   get:
 *     summary: Listar auditoría
 *     tags: [Ops]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/AuditLogList' } } } }
 */
opsRouter.get('/audit', audit.list);
/**
 * @swagger
 * /api/v1/ops/settings:
 *   get:
 *     summary: Obtener settings
 *     tags: [Ops]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/OpsSettings' } } } }
 */
opsRouter.get('/settings', settings.get);
/**
 * @swagger
 * /api/v1/ops/settings:
 *   patch:
 *     summary: Actualizar settings
 *     tags: [Ops]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/OpsSettingsPatch' }
 *     responses:
 *       204: { description: Actualizado }
 */
opsRouter.patch('/settings', settings.patch);

module.exports = { opsRouter };
