import { Router } from 'express';
import { authRequired, adminRequired } from '../middleware/auth.js';
import {
  getStats,
  listHosts,
  getHost,
  createHost,
  updateHost,
  deleteHost,
  listAllProperties,
  createPropertyForHost,
  updatePropertyAdmin,
  deletePropertyAdmin,
  listAllReservations,
  updateReservationAdmin,
  listAllPayments,
  getPaymentStats,
} from '../controllers/adminController.js';

const router = Router();

// Todas as rotas admin requerem autenticação + role admin
router.use(authRequired, adminRequired);

// ============================================
// Dashboard
// ============================================
router.get('/stats', getStats);

// ============================================
// Hosts (Anfitriões)
// ============================================
router.get('/hosts', listHosts);
router.get('/hosts/:id', getHost);
router.post('/hosts', createHost);
router.put('/hosts/:id', updateHost);
router.delete('/hosts/:id', deleteHost);

// ============================================
// Properties (Imóveis)
// ============================================
router.get('/properties', listAllProperties);
router.post('/properties', createPropertyForHost);
router.put('/properties/:id', updatePropertyAdmin);
router.delete('/properties/:id', deletePropertyAdmin);

// ============================================
// Reservations (Reservas)
// ============================================
router.get('/reservations', listAllReservations);
router.put('/reservations/:id', updateReservationAdmin);

// ============================================
// Payments (Pagamentos)
// ============================================
router.get('/payments', listAllPayments);
router.get('/payments/stats', getPaymentStats);

export default router;
