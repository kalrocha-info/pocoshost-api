import { Router } from 'express';
import { list, create } from '../controllers/paymentsController.js';
import { authRequired } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';

const router = Router();
router.get('/', authRequired, list);
router.post('/', authRequired, validate(schemas.payment), create);
export default router;
