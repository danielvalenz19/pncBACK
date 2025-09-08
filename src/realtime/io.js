const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io;
const debugOn = process.env.RT_DEBUG === '1';

function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (process.env.CORS_ORIGIN?.split(',') || ['http://localhost:4200','http://localhost:5173']).map(s => s.trim()),
      credentials: true
    }
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/, '');
      if (!token) return next(new Error('Auth token requerido'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = { user_id: payload.user_id, role: payload.role, email: payload.email };
      next();
    } catch (e) { next(e); }
  });

  io.on('connection', (socket) => {
    const { role } = socket.user || {};

    socket.on('subscribe:ops', (ack) => {
      if (!['admin','operator','supervisor'].includes(role)) {
        return ack && ack({ ok:false, error:'forbidden' });
      }
      socket.join('ops');
      return ack && ack({ ok:true });
    });

    socket.on('subscribe:incident', ({ id }, ack) => {
      if (['admin','operator','supervisor'].includes(role)) {
        socket.join(`incident:${id}`);
        return ack && ack({ ok:true });
      }
      socket.join(`incident:${id}`);
      return ack && ack({ ok:true });
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

function incidentNew(payload) {
  if (debugOn) console.log('[rt] incidents:new', payload);
  io?.to('ops').emit('incidents:new', payload);
  // También mandar un snapshot inicial a la sala específica si alguien ya está suscrito
  io?.to(`incident:${payload.id}`).emit('incident:update', { id: payload.id, patch: { status: payload.status || 'NEW', location: payload.lat && payload.lng ? { lat: payload.lat, lng: payload.lng, at: payload.created_at } : undefined } });
}
function incidentUpdate(id, patch) {
  if (debugOn) console.log('[rt] incidents:update', id, patch);
  io?.to('ops').emit('incidents:update', { id, patch });
  io?.to(`incident:${id}`).emit('incident:update', { id, patch });
}
function unitUpdate(payload) {
  if (debugOn) console.log('[rt] units:update', payload);
  io?.to('ops').emit('units:update', payload);
}
function geoUpdate(payload) {
  if (debugOn) console.log('[rt] geo:update', payload);
  io?.to('ops').emit('geo:update', payload);
}

module.exports = { initRealtime, rt: { incidentNew, incidentUpdate, unitUpdate, geoUpdate } };
