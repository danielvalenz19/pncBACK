function errorHandler(err, _req, res, _next) {
  console.error('❌', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.code || 'InternalError',
    message: err.message || 'Error interno'
  });
}

module.exports = { errorHandler };
