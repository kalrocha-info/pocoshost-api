import { Router } from 'express';
import { list, getById, create, updateStatus, checkAvailability } from '../controllers/reservationsController.js';
import { authRequired } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';

const router = Router();
router.get('/availability', checkAvailability);
router.get('/', authRequired, list);
router.get('/:id', authRequired, getById);
router.post('/', authRequired, validate(schemas.reservation), create);
router.patch('/:id/status', authRequired, validate(schemas.updateStatus), updateStatus);
export default router;
