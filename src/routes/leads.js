import { Router } from 'express'
import { createHostLead } from '../controllers/leadsController.js'
import { leadLimiter } from '../middleware/rateLimit.js'
import { schemas, validate } from '../middleware/validate.js'

const router = Router()

router.post('/host', leadLimiter, validate(schemas.hostLead), createHostLead)

export default router
