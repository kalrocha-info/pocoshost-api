import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { sendServerError } from '../utils/http.js';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { sendEmailVerification } from '../services/emailService.js';

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function createVerificationToken() {
  return randomBytes(32).toString('hex');
}

function publicUser(user) {
  const { password_hash, email_verification_token_hash, ...safeUser } = user;
  return safeUser;
}

async function issueVerificationEmail(user, client = pool) {
  const token = createVerificationToken();
  const tokenHash = hashToken(token);
  await client.query(
    `UPDATE users
     SET email_verification_token_hash = $1,
         email_verification_sent_at = NOW(),
         updated_date = NOW()
     WHERE id = $2`,
    [tokenHash, user.id]
  );

  try {
    await sendEmailVerification(user, token);
  } catch (err) {
    console.error('[Auth] Falha ao enviar e-mail de verificação:', err.message);
  }
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
      `INSERT INTO users (full_name, email, password_hash, role, document_type, document_number, company_name, address_info, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
       RETURNING id, email, full_name, role, email_verified`,
      [full_name, email, password_hash, assignedRole, document_type, document_number, company_name, address_info]
    );
    const user = result.rows[0];
    await issueVerificationEmail(user);
    res.status(201).json({
      success: true,
      email_verification_required: true,
      message: 'Cadastro criado. Verifique seu e-mail para ativar a conta.',
      user,
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email já cadastrado.' });
    sendServerError(res, err);
  }
}

export async function verifyEmail(req, res) {
  const token = req.body?.token || req.query?.token;
  if (!token) return res.status(400).json({ error: 'Token de verificação é obrigatório.' });

  try {
    const tokenHash = hashToken(token);
    const result = await pool.query(
      `UPDATE users
       SET email_verified = TRUE,
           email_verified_at = NOW(),
           email_verification_token_hash = NULL,
           updated_date = NOW()
       WHERE email_verification_token_hash = $1
         AND is_anonymized = FALSE
       RETURNING id, email, full_name, role, email_verified`,
      [tokenHash]
    );

    if (!result.rows[0]) {
      return res.status(400).json({ error: 'Link de verificação inválido ou já utilizado.' });
    }

    const user = result.rows[0];
    res.json({ token: signToken(user), user });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function resendVerification(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email é obrigatório.' });

  try {
    const result = await pool.query(
      `SELECT id, email, full_name, email_verified
       FROM users WHERE email = $1 AND is_anonymized = FALSE`,
      [email]
    );
    const user = result.rows[0];

    if (user && !user.email_verified) {
      await issueVerificationEmail(user);
    }

    res.json({ success: true, message: 'Se houver uma conta pendente para este e-mail, enviaremos um novo link.' });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'email e password são obrigatórios.' });

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND is_anonymized = FALSE', [email]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Credenciais inválidas.' });

    if (!user.email_verified) {
      return res.status(403).json({
        error: 'Confirme seu e-mail antes de entrar.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    const safeUser = publicUser(user);
    res.json({ token: signToken(safeUser), user: safeUser });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function me(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, role, avatar_url, phone, document_type,
              document_number, company_name, address_info, email_verified, created_date
       FROM users WHERE id = $1 AND is_anonymized = FALSE`,
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
       updated_date = NOW() WHERE id = $4 AND is_anonymized = FALSE
       RETURNING id, full_name, email, role, avatar_url, phone, email_verified`,
      [full_name, phone, avatar_url, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function deleteMe(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT id, email FROM users WHERE id = $1 AND is_anonymized = FALSE FOR UPDATE',
      [req.user.id]
    );
    const user = userResult.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const active = await client.query(
      `SELECT
        (SELECT COUNT(*) FROM reservations WHERE guest_id = $1 AND status IN ('pending', 'confirmed')) +
        (SELECT COUNT(*) FROM reservations r JOIN properties p ON p.id = r.property_id
          WHERE p.created_by = $1 AND r.status IN ('pending', 'confirmed')) AS count`,
      [req.user.id]
    );

    if (Number(active.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Não é possível excluir dados enquanto houver reservas pendentes ou confirmadas.'
      });
    }

    const anonymizedEmail = `deleted+${req.user.id}@pocoshost.local`;
    const anonymizedPassword = await bcrypt.hash(randomUUID(), 10);

    await client.query('DELETE FROM favorites WHERE user_id = $1', [req.user.id]);
    await client.query(
      `UPDATE reviews
       SET user_id = NULL,
           user_email = NULL,
           guest_name = 'Usuário excluído',
           updated_date = NOW()
       WHERE user_id = $1 OR user_email = $2`,
      [req.user.id, user.email]
    );
    await client.query(
      `UPDATE reservations
       SET guest_id = NULL,
           guest_email = CASE WHEN guest_id = $1 OR guest_email = $2 THEN NULL ELSE guest_email END,
           guest_name = CASE WHEN guest_id = $1 OR guest_email = $2 THEN 'Usuário excluído' ELSE guest_name END,
           host_email = CASE WHEN host_email = $2 THEN NULL ELSE host_email END,
           updated_date = NOW()
       WHERE guest_id = $1 OR guest_email = $2 OR host_email = $2`,
      [req.user.id, user.email]
    );
    await client.query(
      `UPDATE payments
       SET guest_email = CASE WHEN guest_email = $1 THEN NULL ELSE guest_email END,
           host_email = CASE WHEN host_email = $1 THEN NULL ELSE host_email END,
           updated_date = NOW()
       WHERE guest_email = $1 OR host_email = $1`,
      [user.email]
    );
    await client.query(
      `UPDATE properties
       SET host_email = CASE WHEN host_email = $2 THEN NULL ELSE host_email END,
           host_name = CASE WHEN created_by = $1 OR host_email = $2 THEN 'Anfitrião removido' ELSE host_name END,
           created_by = CASE WHEN created_by = $1 THEN NULL ELSE created_by END,
           updated_date = NOW()
       WHERE created_by = $1 OR host_email = $2`,
      [req.user.id, user.email]
    );
    await client.query(
      `UPDATE users
       SET full_name = 'Usuário excluído',
           email = $2,
           password_hash = $3,
           avatar_url = NULL,
           phone = NULL,
           document_type = NULL,
           document_number = NULL,
           company_name = NULL,
           address_info = NULL,
           email_verified = FALSE,
           email_verified_at = NULL,
           email_verification_token_hash = NULL,
           is_anonymized = TRUE,
           anonymized_at = NOW(),
           updated_date = NOW()
       WHERE id = $1`,
      [req.user.id, anonymizedEmail, anonymizedPassword]
    );

    await client.query('COMMIT');
    res.json({ success: true, anonymized: true });
  } catch (err) {
    await client.query('ROLLBACK');
    sendServerError(res, err);
  } finally {
    client.release();
  }
}
