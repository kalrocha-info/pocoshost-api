import { logger } from '../services/logger.js';

export function sendServerError(res, err) {
  logger.error('server_error', {
    message: err?.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
  });
  const message = process.env.NODE_ENV === 'production'
    ? 'Erro interno do servidor.'
    : (err?.message ?? 'Erro interno do servidor.');
  return res.status(500).json({ error: message });
}

export function isValidUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function assertUUID(res, value, label = 'id') {
  if (isValidUUID(value)) return true;
  res.status(400).json({ error: `O parâmetro "${label}" não é um UUID válido.` });
  return false;
}
