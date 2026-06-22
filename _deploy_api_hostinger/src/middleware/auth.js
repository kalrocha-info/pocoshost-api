import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';

async function getActiveUser(payload) {
  const result = await pool.query(
    `SELECT id, email, role, full_name, is_anonymized, email_verified, account_status
     FROM users WHERE id = $1`,
    [payload.id]
  );
  const user = result.rows[0];
  if (!user || user.is_anonymized || !user.email_verified || user.account_status === 'blocked') return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    email_verified: user.email_verified,
    account_status: user.account_status,
  };
}

export async function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    const user = await getActiveUser(payload);
    if (!user) return res.status(401).json({ error: 'Token inválido, expirado, e-mail não verificado ou conta bloqueada.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido, expirado, e-mail não verificado ou conta bloqueada.' });
  }
}

export async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      req.user = await getActiveUser(payload);
    } catch { /* ignora token inválido */ }
  }
  next();
}

export function adminRequired(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }
  next();
}
