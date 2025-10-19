const express = require('express');
const ctrl = require('../controllers/adminCitizensController');

const router = express.Router();

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getOne);
router.patch('/:id', ctrl.update);
router.patch('/:id/status', ctrl.updateStatus);

module.exports = { citizensRouter: router };

