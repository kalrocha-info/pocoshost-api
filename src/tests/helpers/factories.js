import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../../testApp.js';
import { pool } from '../../db/pool.js';
import { randomUUID } from 'crypto';

export const app = createApp();

function signTestToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Cria usuário verificado para testes que não exercitam o fluxo de verificação de e-mail.
export async function createUser(overrides = {}) {
  const password = overrides.password ?? 'senha123';
  const role = overrides.role ?? 'guest';
  const documentType = role === 'host' ? (overrides.document_type ?? 'cpf') : overrides.document_type;
  const documentNumber = role === 'host' ? (overrides.document_number ?? '00000000000') : overrides.document_number;
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users
      (full_name, email, password_hash, role, document_type, document_number,
       company_name, address_info, email_verified, email_verified_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,NOW())
     RETURNING id, email, full_name, role, email_verified`,
    [
      overrides.full_name ?? 'Teste User',
      overrides.email ?? `user_${randomUUID()}@example.test`,
      passwordHash,
      role,
      documentType,
      documentNumber,
      overrides.company_name,
      overrides.address_info,
    ]
  );
  const user = result.rows[0];
  return { token: signTestToken(user), user, password };
}

export async function createProperty(token, overrides = {}) {
  const data = {
    title: overrides.title ?? 'Pousada Teste',
    city: overrides.city ?? 'Poços de Caldas',
    state: 'MG',
    category: overrides.category ?? 'pousada',
    price_per_night: overrides.price_per_night ?? 300,
    max_guests: overrides.max_guests ?? 4,
    bedrooms: 2,
    bathrooms: 1,
    tags: ['wifi', 'piscina'],
    cover_photo: 'https://images.unsplash.com/photo-1587061949409-02df41d5e562?w=400',
    ...overrides,
  };
  const res = await request(app)
    .post('/api/properties')
    .set('Authorization', `Bearer ${token}`)
    .send(data);
  return res.body;
}

export async function createReservation(token, propertyId, overrides = {}) {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(); dayAfter.setDate(dayAfter.getDate() + 3);
  const data = {
    property_id: propertyId,
    check_in: overrides.check_in ?? tomorrow.toISOString().split('T')[0],
    check_out: overrides.check_out ?? dayAfter.toISOString().split('T')[0],
    guests: overrides.guests ?? 2,
  };
  const res = await request(app)
    .post('/api/reservations')
    .set('Authorization', `Bearer ${token}`)
    .send(data);
  return res.body;
}
