import bcrypt from 'bcryptjs';
import { sendServerError } from '../utils/http.js';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export async function register(req, res) {
  const { full_name, email, password, role, document_type, document_number, company_name, address_info } = req.body;
  if (!full_name || !email || !password)
    return res.status(400).json({ error: 'full_name, email e password são obrigatórios.' });

  const assignedRole = role === 'host' ? 'host' : 'guest';

  if (assignedRole === 'host') {
    if (!document_type || !document_number) {
      return res.status(400).json({ error: 'Tipo e número de documento são obrigatórios para anfitriões.' });
    }
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, document_type, document_number, company_name, address_info)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, full_name, role`,
      [full_name, email, password_hash, assignedRole, document_type, document_number, company_name, address_info]
    );
    const user = result.rows[0];
    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email já cadastrado.' });
    sendServerError(res, err);
  }
}

export async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'email e password são obrigatórios.' });

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1', [email]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Credenciais inválidas.' });

    const { password_hash, ...safeUser } = user;
    res.json({ token: signToken(safeUser), user: safeUser });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function me(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, full_name, email, role, avatar_url, phone, document_type, document_number, company_name, address_info, created_date FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function updateProfile(req, res) {
  const { full_name, phone, avatar_url } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users SET full_name = COALESCE($1, full_name),
       phone = COALESCE($2, phone), avatar_url = COALESCE($3, avatar_url),
       updated_date = NOW() WHERE id = $4
       RETURNING id, full_name, email, role, avatar_url, phone`,
      [full_name, phone, avatar_url, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}
