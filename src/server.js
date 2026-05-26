import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { globalLimiter } from './middleware/rateLimit.js';
import { sendServerError } from './utils/http.js';

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

const app = express();

// A Hostinger opera atras de proxy reverso; necessario para rate limit e IP real.
app.set('trust proxy', 1);

// ============================================
// SEGURANÇA - Headers e Proteções
// ============================================

// Helmet - Headers de segurança
app.use(helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Necessário para alguns frameworks
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.asaas.com", "https://sandbox.asaas.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  // Previne clickjacking
  frameguard: { action: 'deny' },
  // Previne MIME type sniffing
  noSniff: true,
  // Habilita XSS filter do navegador
  xssFilter: true,
  // Remove header X-Powered-By
  hidePoweredBy: true,
  // HSTS - Force HTTPS (apenas em produção)
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000, // 1 ano
    includeSubDomains: true,
    preload: true,
  } : false,
  // Referrer Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Health checks publicos antes do CORS para suportar monitores, curl e painel da Hostinger.
app.get('/', (_, res) => res.json({ status: 'ok', project: 'PoçosHost API' }));
app.get('/api/health', (_, res) => res.json({ status: 'ok', project: 'PoçosHost API' }));

// ============================================
// CORS - Cross-Origin Resource Sharing
// ============================================
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:5174').split(',');

app.use(cors({ 
  origin: (origin, callback) => {
    // Requisicoes server-to-server, health checks, curl e painel da Hostinger nao enviam Origin.
    // CORS protege browsers; bloquear ausencia de Origin gera falsos 500 em producao.
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`CORS bloqueado para origin: ${origin}`);
    const error = new Error('Não permitido pelo CORS');
    error.status = 403;
    return callback(error);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
  maxAge: 86400, // Cache preflight por 24h
}));

// ============================================
// Rate Limiting
// ============================================
app.use(globalLimiter);

// ============================================
// Body Parser com limite
// ============================================
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ============================================
// Headers de segurança adicionais
// ============================================
app.use((req, res, next) => {
  // Previne cache de dados sensíveis
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Permissions Policy (antigo Feature-Policy)
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
});

// Rotas
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

// Handler global de erros — nunca deixa o servidor crashar
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message ?? 'Erro na requisição.' });
  }
  return sendServerError(res, err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 PoçosHost API rodando na porta ${PORT}`));

export default app;
