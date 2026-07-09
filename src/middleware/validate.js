import { z } from 'zod';

const strongPassword = z.string()
  .min(10, 'Senha deve ter pelo menos 10 caracteres')
  .regex(/[a-z]/, 'Senha deve conter letra minúscula')
  .regex(/[A-Z]/, 'Senha deve conter letra maiúscula')
  .regex(/\d/, 'Senha deve conter número')
  .regex(/[^A-Za-z0-9]/, 'Senha deve conter caractere especial');

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
    password: strongPassword,
    role: z.enum(['guest', 'host']).optional().default('guest'),
    document_type: z.string().optional(),
    document_number: z.string().optional(),
    company_name: z.string().optional(),
    address_info: z.string().optional(),
    utm_source: z.string().trim().max(150).optional().nullable(),
    utm_medium: z.string().trim().max(150).optional().nullable(),
    utm_campaign: z.string().trim().max(200).optional().nullable(),
    utm_content: z.string().trim().max(200).optional().nullable(),
    utm_term: z.string().trim().max(200).optional().nullable(),
    landing_page: z.string().trim().max(2000).optional().nullable(),
    referrer: z.string().trim().max(2000).optional().nullable(),
  }),

  login: z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(1, 'Password obrigatória'),
  }),

  resendVerification: z.object({
    email: z.string().email('Email inválido'),
  }),

  requestPasswordReset: z.object({
    email: z.string().email('Email inválido'),
  }),

  resetPassword: z.object({
    token: z.string().min(32, 'Token inválido'),
    password: strongPassword,
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
    billing_type: z.enum(['CREDIT_CARD', 'PIX']).optional().default('CREDIT_CARD'),
    card_last4: z.string().length(4).optional().nullable(),
    card_number: z.string().optional(),
    card_holder_name: z.string().optional(),
    card_expiry: z.string().optional(),
    card_cvv: z.string().optional(),
    billing_cpf_cnpj: z.string().optional(),
    billing_phone: z.string().optional(),
    billing_postal_code: z.string().optional(),
    billing_address_number: z.string().optional(),
  }).refine((data) => {
    if (data.billing_type === 'PIX') return true;
    const hasCardData = data.card_number || data.card_holder_name || data.card_expiry || data.card_cvv;
    if (!hasCardData) return false;
    return Boolean(data.card_number && data.card_holder_name && data.card_expiry && data.card_cvv &&
      data.billing_cpf_cnpj && data.billing_phone && data.billing_postal_code && data.billing_address_number);
  }, {
    message: 'Para pagar com cartão, informe cartão, CPF/CNPJ, telefone, CEP e número do endereço.',
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
    status: z.enum(['approved','cancelled','completed'], {
      errorMap: () => ({ message: 'Status deve ser: approved, cancelled ou completed' }),
    }),
  }),

  crmContact: z.object({
    user_id: z.string().uuid('user_id deve ser um UUID válido').optional().nullable(),
    full_name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(255),
    email: z.string().trim().email('Email inválido').max(255).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    contact_type: z.enum(['guest', 'host', 'partner']).optional().default('guest'),
    stage: z.enum(['lead', 'contacted', 'qualified', 'onboarding', 'active', 'inactive'])
      .optional()
      .default('lead'),
    source: z.string().trim().max(100).optional().nullable(),
    summary: z.string().trim().max(2000).optional().nullable(),
    assigned_to: z.string().uuid('assigned_to deve ser um UUID válido').optional().nullable(),
    next_action_at: z.string().datetime({ offset: true }).optional().nullable(),
  }),

  crmContactUpdate: z.object({
    full_name: z.string().trim().min(2).max(255).optional(),
    email: z.string().trim().email('Email inválido').max(255).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    contact_type: z.enum(['guest', 'host', 'partner']).optional(),
    stage: z.enum(['lead', 'contacted', 'qualified', 'onboarding', 'active', 'inactive'])
      .optional(),
    source: z.string().trim().max(100).optional().nullable(),
    summary: z.string().trim().max(2000).optional().nullable(),
    assigned_to: z.string().uuid('assigned_to deve ser um UUID válido').optional().nullable(),
    next_action_at: z.string().datetime({ offset: true }).optional().nullable(),
  }).refine(data => Object.keys(data).length > 0, {
    message: 'Nenhum campo para atualizar.',
  }),

  crmActivity: z.object({
    activity_type: z.enum(['note', 'call', 'email', 'meeting', 'task'])
      .optional()
      .default('note'),
    content: z.string().trim().min(1, 'Descrição obrigatória').max(3000),
    due_at: z.string().datetime({ offset: true }).optional().nullable(),
  }),

  crmActivityUpdate: z.object({
    completed: z.boolean(),
  }),

  maintenanceOrder: z.object({
    property_id: z.string().uuid('property_id deve ser um UUID válido').optional().nullable(),
    service_provider_id: z.string().uuid('service_provider_id deve ser um UUID válido').optional().nullable(),
    title: z.string().trim().min(3, 'Título deve ter pelo menos 3 caracteres').max(255),
    service_type: z.enum(['inspection', 'cleaning', 'repair', 'renovation', 'setup', 'other'])
      .optional()
      .default('other'),
    status: z.enum(['requested', 'quoted', 'approved', 'scheduled', 'in_progress', 'done', 'cancelled'])
      .optional()
      .default('requested'),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
    description: z.string().trim().max(3000).optional().nullable(),
    provider_amount: z.coerce.number().nonnegative().optional().nullable(),
    coordination_fee: z.coerce.number().nonnegative().optional().nullable(),
    scheduled_for: z.string().datetime({ offset: true }).optional().nullable(),
  }),

  maintenanceOrderUpdate: z.object({
    property_id: z.string().uuid('property_id deve ser um UUID válido').optional().nullable(),
    service_provider_id: z.string().uuid('service_provider_id deve ser um UUID válido').optional().nullable(),
    title: z.string().trim().min(3).max(255).optional(),
    service_type: z.enum(['inspection', 'cleaning', 'repair', 'renovation', 'setup', 'other']).optional(),
    status: z.enum(['requested', 'quoted', 'approved', 'scheduled', 'in_progress', 'done', 'cancelled'])
      .optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    description: z.string().trim().max(3000).optional().nullable(),
    provider_amount: z.coerce.number().nonnegative().optional().nullable(),
    coordination_fee: z.coerce.number().nonnegative().optional().nullable(),
    scheduled_for: z.string().datetime({ offset: true }).optional().nullable(),
    completed_at: z.string().datetime({ offset: true }).optional().nullable(),
  }).refine(data => Object.keys(data).length > 0, {
    message: 'Nenhum campo para atualizar.',
  }),

  maintenancePhoto: z.object({
    photo_type: z.enum(['before', 'after', 'receipt', 'other']).optional().default('other'),
    url: z.string().trim().url('URL inválida').max(2000),
    caption: z.string().trim().max(500).optional().nullable(),
  }),

  hostLead: z.object({
    full_name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(255),
    email: z.string().trim().email('Email inválido').max(255).optional().nullable(),
    phone: z.string().trim().min(8, 'Telefone inválido').max(50).optional().nullable(),
    property_type: z.enum(['casa', 'apartamento', 'chale', 'pousada', 'sitio', 'hotel', 'outro']),
    city: z.string().trim().min(2, 'Cidade obrigatória').max(150),
    neighborhood: z.string().trim().max(150).optional().nullable(),
    bedrooms: z.coerce.number().int().min(0).max(20).optional().nullable(),
    management_interest: z.enum(['complete_management', 'direct_listing', 'maintenance_only', 'unsure'])
      .optional()
      .default('complete_management'),
    property_status: z.enum(['ready', 'needs_adjustments', 'under_renovation', 'planning', 'unknown'])
      .optional()
      .default('unknown'),
    accepts_maintenance_coordination: z.boolean().optional().default(false),
    notes: z.string().trim().max(1000).optional().nullable(),
    privacy_accepted: z.literal(true, {
      errorMap: () => ({ message: 'É necessário aceitar a Política de Privacidade' }),
    }),
    contact_consent: z.literal(true, {
      errorMap: () => ({ message: 'É necessário autorizar o contato sobre a solicitação' }),
    }),
    marketing_consent: z.boolean().optional().default(false),
    utm_source: z.string().trim().max(150).optional().nullable(),
    utm_medium: z.string().trim().max(150).optional().nullable(),
    utm_campaign: z.string().trim().max(200).optional().nullable(),
    utm_content: z.string().trim().max(200).optional().nullable(),
    utm_term: z.string().trim().max(200).optional().nullable(),
    landing_page: z.string().trim().max(2000).optional().nullable(),
    referrer: z.string().trim().max(2000).optional().nullable(),
    website: z.string().max(200).optional().default(''),
  }).refine(data => Boolean(data.email || data.phone), {
    message: 'Informe pelo menos e-mail ou telefone.',
    path: ['phone'],
  }),
};
