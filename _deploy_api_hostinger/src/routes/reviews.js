import { Router } from 'express';
import { listByProperty, create, remove } from '../controllers/reviewsController.js';
import { authRequired, optionalAuth } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';

const router = Router();
router.get('/property/:propertyId', optionalAuth, listByProperty);
router.post('/', authRequired, validate(schemas.review), create);
router.delete('/:id', authRequired, remove);
export default router;
