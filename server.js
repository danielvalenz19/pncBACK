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
const { authenticate } = require('./src/middlewares/auth');
const { errorHandler } = require('./src/middlewares/errorHandler');

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
  res.json({ user_id: req.user.user_id, role: req.user.role, email: req.user.email || null });
});
app.use('/api/v1/users', authenticate, usersRouter);
// Rutas de administración (protegidasy requieren rol admin internamente)
app.use('/api/v1/admin', authenticate, adminRouter);

/* 404 */
app.use((_req, res) => res.status(404).json({ error: 'NotFound', message: 'Recurso no encontrado' }));

/* Errores */
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
http.createServer(app).listen(PORT, () => {
  console.log(`🚀 API escuchando en http://localhost:${PORT}`);
});
