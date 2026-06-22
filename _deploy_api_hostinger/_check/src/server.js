import 'dotenv/config';
import { randomUUID } from 'crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { globalLimiter } from './middleware/rateLimit.js';
import { sendServerError } from './utils/http.js';
import { logger, requestContext } from './services/logger.js';
import { startReservationExpirationWorker } from './services/reservationExpirationService.js';
import { runMigrations } from './db/migrate.js';
import { getAsaasConfigSummary } from './services/asaasService.js';

import authRoutes from './routes/auth.js';
import propertiesRoutes from './routes/properties.js';
import reservationsRoutes from './routes/reservations.js';
import paymentsRoutes from './routes/payments.js';
import reviewsRoutes from './routes/reviews.js';
import favoritesRoutes from './routes/favorites.js';
import categoriesRoutes from './routes/categories.js';
import webhooksRoutes from './routes/webhooks.js';
import adminRoutes from './routes/admin.js';
import uploadRoutes from './routes/upload.js';
import monitoringRoutes from './routes/monitoring.js';

const app = express();

// A Hostinger opera atras de proxy reverso; necessario para rate limit e IP real.
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'", 'https://api.asaas.com', 'https://sandbox.asaas.com'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health checks publicos antes do CORS para suportar monitores, curl e painel da Hostinger.
app.get('/', (_, res) => res.json({ status: 'ok', project: 'PoçosHost API' }));
app.use('/api', monitoringRoutes);
app.get('/api/health', (_, res) => res.json({ status: 'ok', project: 'PoçosHost API' }));

const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174').split(',');

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    logger.warn('cors_blocked', { origin });
    const error = new Error('Não permitido pelo CORS');
    error.status = 403;
    return callback(error);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id'],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page', 'X-Request-Id'],
  maxAge: 86400,
}));

app.use(globalLimiter);

app.use((req, res, next) => {
  req.id = req.get('X-Request-Id') || randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('http_request', {
      ...requestContext(req),
      status_code: res.statusCode,
      duration_ms: Math.round(durationMs),
    });
  });

  next();
});

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/properties', propertiesRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);

app.use((err, req, res, next) => {
  logger.error('unhandled_request_error', { ...requestContext(req), message: err.message });
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message ?? 'Erro na requisição.' });
  }
  return sendServerError(res, err);
});

const PORT = process.env.PORT || 3000;
async function startServer() {
  try {
    await runMigrations();
    logger.info('database_migrations_completed');
  } catch (err) {
    logger.error('database_migrations_failed', { message: err.message });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info('api_started', { port: PORT });
    logger.info('asaas_config_summary', getAsaasConfigSummary());
    startReservationExpirationWorker({
      onError: (err) => logger.error('reservation_expiration_failed', { message: err.message }),
    });
  });
}

startServer();

export default app;
