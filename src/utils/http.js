export function sendServerError(res, err) {
  console.error('[SERVER_ERROR]', err);
  const message = process.env.NODE_ENV === 'production'
    ? 'Erro interno do servidor.'
    : err.message;
  return res.status(500).json({ error: message });
}
