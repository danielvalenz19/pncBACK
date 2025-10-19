const model = require('../models/adminCitizensModel');

exports.stats = async (req, res, next) => {
  try {
    const from = req.query.from || new Date(Date.now() - 30*864e5).toISOString().slice(0,10);
    const to   = req.query.to   || new Date().toISOString().slice(0,10);
    const data = await model.getStats({ from, to });
    res.json(data);
  } catch (e) { next(e); }
};

exports.list = async (req, res, next) => {
  try {
    const { q=null, status=null, page=1, limit=20 } = req.query;
    const data = await model.listCitizens({
      q, status,
      page: Number(page) || 1,
      limit: Number(limit) || 20
    });
    res.json({ items: data.rows, total: data.total, page: data.page, limit: data.limit });
  } catch (e) { next(e); }
};

exports.getOne = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = await model.getCitizenById(id);
    if (!data.citizen) return res.status(404).json({ error:'NotFound', message:'Ciudadano no existe' });
    res.json(data);
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ok = await model.updateCitizen(id, req.body || {});
    if (!ok) return res.status(404).json({ error:'NotFound', message:'Ciudadano no existe' });
    res.status(204).end();
  } catch (e) { next(e); }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (!['active','inactive'].includes(status)) {
      return res.status(400).json({ error:'BadRequest', message:'status inválido' });
    }
    const ok = await model.updateCitizenStatus(id, status);
    if (!ok) return res.status(404).json({ error:'NotFound', message:'Ciudadano no existe' });
    res.status(204).end();
  } catch (e) { next(e); }
};

