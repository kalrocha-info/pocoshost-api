import request from 'supertest';
import { createApp } from '../../testApp.js';
import { randomUUID } from 'crypto';

export const app = createApp();

// Registar e fazer login — devolve { token, user }
export async function createUser(overrides = {}) {
  const data = {
    full_name: overrides.full_name ?? 'Teste User',
    email: overrides.email ?? `user_${randomUUID()}@test.com`,
    password: overrides.password ?? 'senha123',
    role: overrides.role,
    document_type: overrides.role === 'host' ? (overrides.document_type ?? 'cpf') : overrides.document_type,
    document_number: overrides.role === 'host' ? (overrides.document_number ?? '12345678901') : overrides.document_number,
  };
  const res = await request(app).post('/api/auth/register').send(data);
  return { token: res.body.token, user: res.body.user, password: data.password };
}

// Criar imóvel autenticado — devolve o imóvel criado
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

// Criar reserva autenticada — devolve a reserva criada
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

