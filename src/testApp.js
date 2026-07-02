import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import propertiesRoutes from './routes/properties.js';
import reservationsRoutes from './routes/reservations.js';
import paymentsRoutes from './routes/payments.js';
import reviewsRoutes from './routes/reviews.js';
import favoritesRoutes from './routes/favorites.js';
import categoriesRoutes from './routes/categories.js';
import adminRoutes from './routes/admin.js';
import webhooksRoutes from './routes/webhooks.js';
import uploadRoutes from './routes/upload.js';
import monitoringRoutes from './routes/monitoring.js';
import { sendServerError } from './utils/http.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', monitoringRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/properties', propertiesRoutes);
  app.use('/api/reservations', reservationsRoutes);
  app.use('/api/payments', paymentsRoutes);
  app.use('/api/reviews', reviewsRoutes);
  app.use('/api/favorites', favoritesRoutes);
  app.use('/api/categories', categoriesRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/webhooks', webhooksRoutes);
  app.use('/api/upload', uploadRoutes);
  app.get('/api/health', (_, res) => res.json({ status: 'ok' }));
  app.use((err, req, res, next) => sendServerError(res, err));
  return app;
}
