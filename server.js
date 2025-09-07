require('dotenv').config();
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const { authRouter } = require('./src/routes/auth');
const { usersRouter } = require('./src/routes/users');
const { adminRouter } = require('./src/routes/admin');
const { authenticate, requireRole } = require('./src/middlewares/auth');
const { incidentsRouter } = require('./src/routes/incidents');
const { devicesRouter } = require('./src/routes/devices');
const { errorHandler } = require('./src/middlewares/errorHandler');
const { opsRouter } = require('./src/routes/ops');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.LOG_LEVEL || 'dev'));

// Swagger setup
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PNC Panic API',
      version: '1.0.0',
      description: 'API documentation for PNC Panic backend'
    },
    servers: [{ url: `http://localhost:${process.env.PORT || 4000}` }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        IncidentCreate: {
          type: 'object',
          required: ['lat', 'lng', 'device'],
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lng: { type: 'number', minimum: -180, maximum: 180 },
              accuracy: { type: 'number', minimum: 0 },
              battery: { type: 'number', minimum: 0, maximum: 100 },
              device: {
                type: 'object',
                required: ['os','version'],
                properties: {
                  os: { type: 'string', example: 'android' },
                  version: { type: 'string', example: '14' }
                }
              }
            }
        },
        IncidentCreated: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'INC-2025-000001' },
            status: { type: 'string', example: 'NEW' }
          }
        },
        LocationPing: {
          type: 'object',
          required: ['lat','lng'],
          properties: {
            lat: { type: 'number' },
            lng: { type: 'number' },
            accuracy: { type: 'number' },
            ts: { type: 'number', description: 'Epoch seconds o ms' }
          }
        },
        LocationAccepted: {
          type: 'object',
          properties: { accepted: { type: 'boolean', example: true } }
        },
        CancelIncidentRequest: {
          type: 'object',
          properties: { reason: { type: 'string', example: 'falsa alarma' } }
        },
        IncidentStatus: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string', example: 'NEW' },
            started_at: { type: 'string', format: 'date-time' },
            ended_at: { type: 'string', format: 'date-time', nullable: true },
            last_location: {
              type: 'object',
              properties: {
                at: { type: 'string', format: 'date-time' },
                lat: { type: 'number' },
                lng: { type: 'number' },
                accuracy: { type: 'number', nullable: true }
              }
            }
          }
        },
        DeviceRegister: {
          type: 'object',
          required: ['platform','fcm_token'],
          properties: {
            platform: { type: 'string', enum: ['android','ios'] },
            fcm_token: { type: 'string', minLength: 10 }
          }
        },
        DeviceRegistered: {
          type: 'object',
          properties: { device_id: { type: 'integer', example: 123 } }
        },
        OpsIncidentListItem: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'INC-2025-000010' },
            created_at: { type: 'string', format: 'date-time' },
            status: { type: 'string' },
            lat: { type: 'number' },
            lng: { type: 'number' },
            accuracy: { type: 'number', nullable: true },
            priority: { type: 'integer' },
            battery: { type: 'integer', nullable: true }
          }
        },
        OpsIncidentListResponse: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { $ref: '#/components/schemas/OpsIncidentListItem' } },
            page: { type: 'integer' },
            total: { type: 'integer' }
          }
        },
        OpsIncidentDetail: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            citizen: { type: 'object', properties: { name: { type: 'string', nullable: true }, email: { type: 'string', nullable: true }, phone_last4: { type: 'string', nullable: true } } },
            status: { type: 'string' },
            started_at: { type: 'string', format: 'date-time' },
            ended_at: { type: 'string', format: 'date-time', nullable: true },
            locations: { type: 'array', items: { type: 'object', properties: { at: { type: 'string', format: 'date-time' }, lat: { type: 'number' }, lng: { type: 'number' }, accuracy: { type: 'number', nullable: true } } } },
            assignments: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, unit_id: { type: 'integer' }, unit_name: { type: 'string' }, unit_type: { type: 'string' }, plate: { type: 'string', nullable: true }, assigned_at: { type: 'string', format: 'date-time', nullable: true } } } },
            events: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, type: { type: 'string' }, at: { type: 'string', format: 'date-time' }, by: { type: 'integer', nullable: true }, notes: { type: 'string', nullable: true } } } }
          }
        },
        OpsAssignRequest: {
          type: 'object',
          required: ['unit_id'],
          properties: { unit_id: { type: 'integer' }, note: { type: 'string', nullable: true } }
        },
        OpsStatusRequest: {
          type: 'object',
          required: ['status'],
          properties: { status: { type: 'string', enum: ['DISPATCHED','IN_PROGRESS','CLOSED'] }, reason: { type: 'string', nullable: true } }
        },
        OpsNoteRequest: {
          type: 'object',
          required: ['text'],
          properties: { text: { type: 'string' } }
        },
        OpsNoteResponse: {
          type: 'object',
          properties: { id: { type: 'integer' }, at: { type: 'string', format: 'date-time' }, by: { type: 'integer' } }
        },
        Unit: {
          type: 'object',
          properties: { id: { type: 'integer' }, name: { type: 'string' }, type: { type: 'string' }, status: { type: 'string' }, active: { type: 'boolean' }, lat: { type: 'number', nullable: true }, lng: { type: 'number', nullable: true }, last_seen: { type: 'string', format: 'date-time', nullable: true } }
        },
        UnitCreateRequest: {
          type: 'object',
          required: ['name','type'],
          properties: { name: { type: 'string' }, type: { type: 'string', enum: ['patrol','moto','ambulance'] }, plate: { type: 'string', nullable: true }, active: { type: 'boolean', default: true } }
        },
        UnitUpdateRequest: {
          type: 'object',
          properties: { name: { type: 'string' }, type: { type: 'string', enum: ['patrol','moto','ambulance'] }, plate: { type: 'string', nullable: true }, active: { type: 'boolean' }, status: { type: 'string', enum: ['available','en_route','on_site','out_of_service'] } }
        },
        OpsSettings: {
          type: 'object',
          properties: { countdown_seconds: { type: 'integer' }, ping_interval_seconds: { type: 'integer' }, data_retention_days: { type: 'integer' }, sla_ack_seconds: { type: 'integer' } }
        },
        OpsSettingsPatch: {
          type: 'object',
          properties: { countdown_seconds: { type: 'integer' }, ping_interval_seconds: { type: 'integer' }, data_retention_days: { type: 'integer' }, sla_ack_seconds: { type: 'integer' } }
        },
        AuditLogList: {
          type: 'object',
          properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, who: { type: 'integer', nullable: true }, action: { type: 'string' }, entity: { type: 'string' }, entity_id: { type: 'string' }, at: { type: 'string', format: 'date-time' }, ip: { type: 'string', nullable: true } } } }, page: { type: 'integer' }, total: { type: 'integer' } }
        },
        Kpis: {
          type: 'object',
          properties: {
            tta: { type: 'object', properties: { p50: { type: 'integer', nullable: true }, p90: { type: 'integer', nullable: true }, p95: { type: 'integer', nullable: true } } },
            ttr: { type: 'object', properties: { p50: { type: 'integer', nullable: true }, p90: { type: 'integer', nullable: true }, p95: { type: 'integer', nullable: true } } },
            sla_pct: { type: 'integer', nullable: true },
            cancellations_pct: { type: 'integer', nullable: true }
          }
        }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: ['./src/routes/*.js', './src/controllers/*.js']
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/* Salud/diagnóstico */
app.get('/health', (_req, res) => res.json({ ok: true, env: process.env.NODE_ENV || 'development' }));

/* Auth */
app.use('/api/v1/auth', authRouter);

/* Rutas protegidas */
app.get('/api/v1/me', authenticate, (req, res) => {
  // Token ya incluye must_change si aplica
  res.json({
    user_id: req.user.user_id,
    role: req.user.role,
    email: req.user.email || null,
    must_change: !!req.user.must_change
  });
});
app.use('/api/v1/users', authenticate, usersRouter);
// Rutas de administración (protegidasy requieren rol admin internamente)
app.use('/api/v1/admin', authenticate, requireRole('admin'), adminRouter);
// App móvil (ciudadano) roles permitidos: unit, admin (admin para pruebas)
app.use('/api/v1/incidents', authenticate, requireRole('unit','admin'), incidentsRouter);
app.use('/api/v1/devices', authenticate, requireRole('unit','admin'), devicesRouter);
// Portal operación/despacho
app.use('/api/v1/ops', authenticate, requireRole('operator','supervisor','admin'), opsRouter);

/* 404 */
app.use((_req, res) => res.status(404).json({ error: 'NotFound', message: 'Recurso no encontrado' }));

/* Errores */
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
http.createServer(app).listen(PORT, () => {
  console.log(`🚀 API escuchando en http://localhost:${PORT}`);
});
