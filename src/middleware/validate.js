import { z } from 'zod';

// Middleware factory — valida req.body com schema Zod
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const messages = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`);
      return res.status(400).json({ error: messages.join('; ') });
    }
    req.body = result.data;
    next();
  };
}

// Schemas de validação
export const schemas = {
  register: z.object({
    full_name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
    role: z.enum(['guest', 'host']).optional().default('guest'),
    document_type: z.string().optional(),
    document_number: z.string().optional(),
    company_name: z.string().optional(),
    address_info: z.string().optional(),
  }),

  login: z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(1, 'Password obrigatória'),
  }),

  property: z.object({
    title: z.string().min(3, 'Título deve ter pelo menos 3 caracteres'),
    city: z.string().min(2, 'Cidade obrigatória'),
    category: z.string().min(2, 'Categoria obrigatória'),
    price_per_night: z.number().positive('Preço deve ser positivo'),
    state: z.string().optional(),
    address: z.string().optional(),
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    max_guests: z.number().int().positive().optional(),
    bedrooms: z.number().int().nonnegative().optional(),
    bathrooms: z.number().int().nonnegative().optional(),
    photos: z.array(z.string().url()).optional(),
    cover_photo: z.string().optional(),
    tags: z.array(z.string()).optional(),
    rules: z.string().optional(),
    description: z.string().optional(),
    host_name: z.string().optional(),
    is_active: z.boolean().optional(),
  }),

  propertyUpdate: z.object({
    title: z.string().min(3, 'Título deve ter pelo menos 3 caracteres').optional(),
    city: z.string().min(2, 'Cidade obrigatória').optional(),
    category: z.string().min(2, 'Categoria obrigatória').optional(),
    price_per_night: z.number().positive('Preço deve ser positivo').optional(),
    state: z.string().optional(),
    address: z.string().optional(),
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    max_guests: z.number().int().positive().optional(),
    bedrooms: z.number().int().nonnegative().optional(),
    bathrooms: z.number().int().nonnegative().optional(),
    photos: z.array(z.string().url()).optional(),
    cover_photo: z.string().optional(),
    tags: z.array(z.string()).optional(),
    rules: z.string().optional(),
    description: z.string().optional(),
    host_name: z.string().optional(),
    is_active: z.boolean().optional(),
  }).refine(data => Object.keys(data).length > 0, {
    message: 'Nenhum campo para atualizar.',
  }),

  reservation: z.object({
    property_id: z.string().uuid('property_id deve ser um UUID válido'),
    check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'check_in deve ser YYYY-MM-DD'),
    check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'check_out deve ser YYYY-MM-DD'),
    guests: z.number().int().positive('Número de hóspedes deve ser positivo'),
  }).refine(d => d.check_out > d.check_in, {
    message: 'check_out deve ser posterior a check_in',
    path: ['check_out'],
  }),

  payment: z.object({
    reservation_id: z.string().uuid('reservation_id deve ser um UUID válido'),
    card_last4: z.string().length(4).optional().nullable(),
    card_number: z.string().optional(),
    card_holder_name: z.string().optional(),
    card_expiry: z.string().optional(),
    card_cvv: z.string().optional(),
  }).refine((data) => {
    const hasCardData = data.card_number || data.card_holder_name || data.card_expiry || data.card_cvv;
    if (!hasCardData) return true;
    return Boolean(data.card_number && data.card_holder_name && data.card_expiry && data.card_cvv);
  }, {
    message: 'Para pagar com cartão, é necessário informar número, nome, validade e CVV.',
    path: ['card_number'],
  }),

  review: z.object({
    property_id: z.string().uuid('property_id deve ser um UUID válido'),
    rating: z.number().int().min(1, 'Rating mínimo é 1').max(5, 'Rating máximo é 5'),
    comment: z.string().optional(),
  }),

  favorite: z.object({
    property_id: z.string().uuid('property_id deve ser um UUID válido'),
  }),

  updateStatus: z.object({
    status: z.enum(['confirmed','cancelled','completed'], {
      errorMap: () => ({ message: 'Status deve ser: confirmed, cancelled ou completed' }),
    }),
  }),
};
