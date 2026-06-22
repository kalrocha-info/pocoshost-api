import { Router } from 'express';
import { list, getById, create, update, remove } from '../controllers/propertiesController.js';
import { authRequired, optionalAuth } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';

const router = Router();
router.get('/', optionalAuth, list);
router.get('/:id', optionalAuth, getById);
router.post('/', authRequired, validate(schemas.property), create);
router.put('/:id', authRequired, validate(schemas.propertyUpdate), update);
router.delete('/:id', authRequired, remove);
export default router;
