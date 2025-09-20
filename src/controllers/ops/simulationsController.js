const { pool } = require('../../config/db');

// Estado en memoria
const sim = {
  running: false,
  startedAt: null,
  endsAt: null,
  area: 'centro',
  type: 'emergency',
  note: '',
  targetCount: 0,
  created: 0,
  timer: null,
  tickMs: 3000, // cada 3s genera 1 incidente
  clients: new Set(), // SSE
};

function randInBox(box) {
  const { latMin, latMax, lngMin, lngMax } = box;
  const lat = latMin + Math.random() * (latMax - latMin);
  const lng = lngMin + Math.random() * (lngMax - lngMin);
  const accuracy = Math.round(5 + Math.random() * 30);
  return { lat, lng, accuracy };
}

const AREAS = {
  centro:   { latMin: 14.598, latMax: 14.66,  lngMin: -90.56, lngMax: -90.47 },
  norte:    { latMin: 14.70,  latMax: 14.82,  lngMin: -90.60, lngMax: -90.43 },
  sur:      { latMin: 14.45,  latMax: 14.58,  lngMin: -90.62, lngMax: -90.40 },
  oriente:  { latMin: 14.60,  latMax: 14.72,  lngMin: -90.40, lngMax: -90.25 },
  occidente:{ latMin: 14.62,  latMax: 14.76,  lngMin: -90.70, lngMax: -90.55 },
};

function broadcast(evt, data) {
  const payload = `event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sim.clients) {
    try { res.write(payload); } catch {}
  }
}

async function createIncident() {
  const now = new Date();
  const { lat, lng, accuracy } = randInBox(AREAS[sim.area] ?? AREAS.centro);

  // Inserta incidente (ajusta columnas a tu esquema)
  const [result] = await pool.query(
    `INSERT INTO incidents (summary, description, status, started_at, lat, lng, accuracy, is_simulated)
     VALUES (?, ?, 'NEW', ?, ?, ?, ?, 1)`,
    [
      sim.type === 'emergency' ? 'Simulado: Emergencia' : 'Simulado: Prueba',
      sim.note || 'Incidente generado por simulación',
      now,
      lat, lng, accuracy
    ]
  );
  const id = result.insertId;

  // Evento de “creado” (si usas incident_events)
  await pool.query(
    `INSERT INTO incident_events (incident_id, type, at)
     VALUES (?, 'CREATED', ?)`,
    [id, now]
  );

  sim.created += 1;
  broadcast('progress', { created: sim.created, id });
}

function stopTimer() {
  if (sim.timer) { clearInterval(sim.timer); sim.timer = null; }
  sim.running = false;
  broadcast('stopped', { created: sim.created });
}

function maybeStop() {
  const now = Date.now();
  if (!sim.running) return;
  if ((sim.endsAt && now >= sim.endsAt.getTime()) ||
      (sim.targetCount && sim.created >= sim.targetCount)) {
    stopTimer();
  }
}

async function tick() {
  if (!sim.running) return;
  try { await createIncident(); } catch (e) { console.error(e); }
  maybeStop();
}

exports.start = async (req, res) => {
  if (sim.running) return res.status(409).json({ message: 'Simulation already running' });

  const {
    type = 'emergency',
    duration_minutes = 60,
    count = 10,
    area = 'centro',
    note = ''
  } = req.body || {};

  sim.running = true;
  sim.startedAt = new Date();
  sim.endsAt = new Date(sim.startedAt.getTime() + Number(duration_minutes) * 60000);
  sim.area = String(area).toLowerCase();
  sim.type = String(type).toLowerCase();
  sim.note = String(note || '');
  sim.targetCount = Number(count) || 0;
  sim.created = 0;

  sim.timer = setInterval(tick, sim.tickMs);
  broadcast('started', {
    startedAt: sim.startedAt, endsAt: sim.endsAt, area: sim.area,
    type: sim.type, targetCount: sim.targetCount
  });

  res.json({ ok: true, running: sim.running, startedAt: sim.startedAt, endsAt: sim.endsAt });
};

exports.stop = async (_req, res) => {
  stopTimer();
  res.json({ ok: true, running: sim.running, created: sim.created });
};

exports.status = async (_req, res) => {
  res.json({
    running: sim.running,
    startedAt: sim.startedAt,
    endsAt: sim.endsAt,
    area: sim.area,
    type: sim.type,
    targetCount: sim.targetCount,
    created: sim.created
  });
};

// Server-Sent Events para progreso
exports.events = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  sim.clients.add(res);

  // envía estado inicial
  broadcast('status', {
    running: sim.running, created: sim.created,
    startedAt: sim.startedAt, endsAt: sim.endsAt
  });

  req.on('close', () => { sim.clients.delete(res); });
};