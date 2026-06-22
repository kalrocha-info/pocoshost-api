import { Router } from 'express';
import {
  register,
  login,
  me,
  updateProfile,
  deleteMe,
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
} from '../controllers/authController.js';
import { authRequired } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = Router();
router.post('/register', authLimiter, validate(schemas.register), register);
router.post('/login', authLimiter, validate(schemas.login), login);
router.post('/verify-email', authLimiter, verifyEmail);
router.get('/verify-email', authLimiter, verifyEmail);
router.post('/resend-verification', authLimiter, validate(schemas.resendVerification), resendVerification);
router.post('/forgot-password', authLimiter, validate(schemas.requestPasswordReset), requestPasswordReset);
router.post('/reset-password', authLimiter, validate(schemas.resetPassword), resetPassword);
router.get('/me', authRequired, me);
router.put('/me', authRequired, updateProfile);
router.delete('/me', authRequired, deleteMe);
export default router;
