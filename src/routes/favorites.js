import { Router } from 'express';
import { list, toggle, check } from '../controllers/favoritesController.js';
import { authRequired } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';

const router = Router();
router.get('/', authRequired, list);
router.post('/toggle', authRequired, validate(schemas.favorite), toggle);
router.get('/check/:propertyId', authRequired, check);
export default router;
