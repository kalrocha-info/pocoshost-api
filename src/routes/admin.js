import { Router } from 'express'
import { authRequired, adminRequired } from '../middleware/auth.js'
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
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser
} from '../controllers/adminController.js'
import {
  listContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  createActivity,
  updateActivity
} from '../controllers/crmController.js'
import {
  listContactMaintenanceOrders,
  createContactMaintenanceOrder,
  updateMaintenanceOrder,
  createMaintenanceOrderPhoto
} from '../controllers/maintenanceController.js'
import { validate, schemas } from '../middleware/validate.js'

const router = Router()

// Todas as rotas admin requerem autenticação + role admin
router.use(authRequired, adminRequired)

// ============================================
// Dashboard
// ============================================
router.get('/stats', getStats)

// ============================================
// CRM leve
// ============================================
router.get('/crm/contacts', listContacts)
router.get('/crm/contacts/:id', getContact)
router.post('/crm/contacts', validate(schemas.crmContact), createContact)
router.put('/crm/contacts/:id', validate(schemas.crmContactUpdate), updateContact)
router.delete('/crm/contacts/:id', deleteContact)
router.post('/crm/contacts/:id/activities', validate(schemas.crmActivity), createActivity)
router.get('/crm/contacts/:id/maintenance-orders', listContactMaintenanceOrders)
router.post(
  '/crm/contacts/:id/maintenance-orders',
  validate(schemas.maintenanceOrder),
  createContactMaintenanceOrder
)
router.patch(
  '/crm/activities/:activityId',
  validate(schemas.crmActivityUpdate),
  updateActivity
)
router.patch(
  '/maintenance-orders/:orderId',
  validate(schemas.maintenanceOrderUpdate),
  updateMaintenanceOrder
)
router.post(
  '/maintenance-orders/:orderId/photos',
  validate(schemas.maintenancePhoto),
  createMaintenanceOrderPhoto
)

// ============================================
// Hosts (Anfitriões)
// ============================================
router.get('/hosts', listHosts)
router.get('/hosts/:id', getHost)
router.post('/hosts', createHost)
router.put('/hosts/:id', updateHost)
router.delete('/hosts/:id', deleteHost)

// ============================================
// Properties (Imóveis)
// ============================================
router.get('/properties', listAllProperties)
router.post('/properties', createPropertyForHost)
router.put('/properties/:id', updatePropertyAdmin)
router.delete('/properties/:id', deletePropertyAdmin)

// ============================================
// Reservations (Reservas)
// ============================================
router.get('/reservations', listAllReservations)
router.put('/reservations/:id', updateReservationAdmin)

// ============================================
// Payments (Pagamentos)
// ============================================
router.get('/payments', listAllPayments)
router.get('/payments/stats', getPaymentStats)

// ============================================
// Users (Usuários)
// ============================================
router.get('/users', listUsers)
router.get('/users/:id', getUser)
router.post('/users', createUser)
router.put('/users/:id', updateUser)
router.delete('/users/:id', deleteUser)

export default router
