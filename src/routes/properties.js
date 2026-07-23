import { Router } from 'express'
import { list, getById, create, update, remove } from '../controllers/propertiesController.js'
import { authRequired, optionalAuth } from '../middleware/auth.js'
import { validate, schemas } from '../middleware/validate.js'
import { cacheHeaders, invalidateCache } from '../middleware/cacheHeaders.js'

const router = Router()
router.get('/', optionalAuth, cacheHeaders('stable', 600), list)
router.get('/:id', optionalAuth, cacheHeaders('stable', 600), getById)
router.post('/', authRequired, validate(schemas.property), invalidateCache('properties:*'), create)
router.put('/:id', authRequired, validate(schemas.propertyUpdate), invalidateCache('properties:*'), update)
router.delete('/:id', authRequired, invalidateCache('properties:*'), remove)
export default router
