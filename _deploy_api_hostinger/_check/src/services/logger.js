const SENSITIVE_KEYS = /authorization|token|password|secret|cookie|card|cvv|cpf|document/i;

function sanitizeValue(value, key = '') {
  if (value === undefined || value === null) return value;
  if (SENSITIVE_KEYS.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitizeValue(entryValue, entryKey)]),
    );
  }
  return value;
}

function write(level, event, details = {}) {
  const payload = {
    level,
    event,
    service: 'pocoshost-api',
    environment: process.env.NODE_ENV ?? 'development',
    timestamp: new Date().toISOString(),
    ...sanitizeValue(details),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event, details) => write('info', event, details),
  warn: (event, details) => write('warn', event, details),
  error: (event, details) => write('error', event, details),
};

export function requestContext(req) {
  return {
    request_id: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    user_id: req.user?.id,
  };
}
