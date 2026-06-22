import { Router } from 'express';
import { clientError, live, ready } from '../controllers/monitoringController.js';

const router = Router();

router.get('/health/live', live);
router.get('/health/ready', ready);
router.post('/monitoring/client-error', clientError);

export default router;
