import { Router } from 'express';
import { register, login, me, updateProfile } from '../controllers/authController.js';
import { authRequired } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = Router();
router.post('/register', authLimiter, validate(schemas.register), register);
router.post('/login', authLimiter, validate(schemas.login), login);
router.get('/me', authRequired, me);
router.put('/me', authRequired, updateProfile);
export default router;
