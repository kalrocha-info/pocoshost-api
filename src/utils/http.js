export function sendServerError(res, err) {
  console.error('[SERVER_ERROR]', err);
  const message = process.env.NODE_ENV === 'production'
    ? 'Erro interno do servidor.'
    : err.message;
  return res.status(500).json({ error: message });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retorna true se a string for um UUID v4 válido.
 * Use antes de qualquer query que aceite um ID de rota ou body.
 */
export function isValidUUID(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Responde 400 e retorna false quando o UUID for inválido.
 * Uso: if (!assertUUID(res, req.params.id)) return;
 */
export function assertUUID(res, value, label = 'id') {
  if (!isValidUUID(value)) {
    res.status(400).json({ error: `O parâmetro "${label}" não é um UUID válido.` });
    return false;
  }
  return true;
}
