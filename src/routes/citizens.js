const { Router } = require('express');
const { authenticate, requireRole } = require('../middlewares/auth');
const ctrl = require('../controllers/adminCitizensController');

const router = Router();

// Staff only: admin, supervisor, operator, unit
router.use(authenticate, requireRole('admin','supervisor','operator','unit'));

// Alias endpoints under /api/v1/citizens*
router.get('/citizens/stats', ctrl.stats);
router.get('/citizens', ctrl.list);
router.post('/citizens', ctrl.create);
router.get('/citizens/:id', ctrl.getOne);
router.patch('/citizens/:id', ctrl.update);
router.patch('/citizens/:id/status', ctrl.updateStatus);

// Optional profile alias
router.get('/citizens/me', authenticate, (req, res) => res.json(req.user));

module.exports = router;

