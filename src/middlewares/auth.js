const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const h = req.header('Authorization');
  if (!h || !h.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Token requerido' });
  }
  const token = h.slice(7);
  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) return res.status(401).json({ error: 'Unauthorized', message: 'Token inválido' });
    req.user = payload;
    next();
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    const r = req.user?.role;
    if (!r || !roles.includes(r)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Rol insuficiente' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
