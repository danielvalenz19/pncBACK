const { Router } = require('express');
const { authenticate, requireRole } = require('../middlewares/auth');
const ctrl = require('../controllers/adminCitizensController');

const r = Router();

// El portal sólo es staff: admin, supervisor, operator, unit
r.use(authenticate, requireRole('admin','supervisor','operator','unit'));

r.get('/stats',   ctrl.stats);           // KPIs + series
r.get('/',        ctrl.list);            // listado paginado + filtros
r.get('/:id',     ctrl.getOne);          // perfil + últimos incidentes
r.patch('/:id',   ctrl.update);          // editar datos básicos
r.patch('/:id/status', ctrl.updateStatus); // activar/bloquear

module.exports = r;

