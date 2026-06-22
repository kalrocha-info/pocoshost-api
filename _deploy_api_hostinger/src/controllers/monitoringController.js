import { pool } from '../db/pool.js';
import { logger } from '../services/logger.js';
import { sendServerError } from '../utils/http.js';

const startedAt = new Date();
const MAX_CLIENT_FIELD_LENGTH = 500;

function truncate(value) {
  if (typeof value !== 'string') return value;
  return value.length > MAX_CLIENT_FIELD_LENGTH ? `${value.slice(0, MAX_CLIENT_FIELD_LENGTH)}...` : value;
}

function sanitizeClientPayload(body = {}) {
  return {
    message: truncate(body.message ?? 'Client error'),
    source: truncate(body.source ?? 'frontend'),
    path: truncate(body.path),
    userAgent: truncate(body.userAgent),
    stack: truncate(body.stack),
    componentStack: truncate(body.componentStack),
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
  };
}

export function live(_, res) {
  res.json({
    status: 'ok',
    service: 'pocoshost-api',
    uptime_seconds: Math.round(process.uptime()),
    started_at: startedAt.toISOString(),
    timestamp: new Date().toISOString(),
  });
}

export async function ready(_, res) {
  const checks = { database: 'unknown' };
  try {
    await pool.query('SELECT 1');
    checks.database = 'ok';
    return res.json({
      status: 'ok',
      service: 'pocoshost-api',
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    checks.database = 'error';
    logger.error('health_ready_failed', { message: err.message });
    return res.status(503).json({
      status: 'error',
      service: 'pocoshost-api',
      checks,
      timestamp: new Date().toISOString(),
    });
  }
}

export function clientError(req, res) {
  try {
    const payload = sanitizeClientPayload(req.body);
    logger.warn('frontend_error', {
      ...payload,
      ip: req.ip,
      request_id: req.id,
    });
    return res.status(202).json({ success: true });
  } catch (err) {
    return sendServerError(res, err);
  }
}
