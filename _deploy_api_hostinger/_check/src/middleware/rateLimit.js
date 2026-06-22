import rateLimit from 'express-rate-limit';

const skipInTests = () => process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300,
  skip: skipInTests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas requisições. Tente novamente em 15 minutos.' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // máx 20 tentativas de login por IP em 15 min
  skip: skipInTests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas tentativas de autenticação. Tente novamente em 15 minutos.' },
});
