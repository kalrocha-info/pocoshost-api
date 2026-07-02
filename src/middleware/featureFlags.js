export function paymentsEnabled(_, res, next) {
  if (process.env.PAYMENTS_ENABLED !== 'true') {
    return res.status(503).json({
      error: 'Pagamentos temporariamente indisponíveis.',
      code: 'PAYMENTS_DISABLED',
    });
  }

  return next();
}
