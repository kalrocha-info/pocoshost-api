import { Router } from 'express';
import { list, create, remove } from '../controllers/categoriesController.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';

const router = Router();

const categorySchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().optional(),
});

router.get('/', list);
router.post('/', authRequired, adminRequired, validate(categorySchema), create);
router.delete('/:slug', authRequired, adminRequired, remove);

export default router;
