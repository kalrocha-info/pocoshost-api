import { Router } from 'express';
import { asaas } from '../controllers/webhooksController.js';

const router = Router();
router.post('/asaas', asaas);
export default router;
