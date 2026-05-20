import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../testApp.js';
import { pool } from '../db/pool.js';
import { createUser, createProperty, createReservation } from './helpers/factories.js';

const app = createApp();

async function createAdmin(overrides = {}) {
  const password = overrides.password ?? 'senha123';
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     RETURNING id, email, full_name, role`,
    [overrides.full_name ?? 'Admin Teste', overrides.email ?? `admin_${Date.now()}@test.com`, passwordHash]
  );
  const user = result.rows[0];
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  return { token, user, password };
}

describe('ADMIN — /api/admin', () => {
  it('bloqueia acesso sem token', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(401);
  });

  it('bloqueia guest em rotas admin', async () => {
    const guest = await createUser();
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${guest.token}`);
    expect(res.status).toBe(403);
  });

  it('permite admin consultar estatisticas', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.total_admins).toBeDefined();
    expect(res.body.total_hosts).toBeDefined();
  });

  it('lista usuarios sem expor password_hash nem documento completo', async () => {
    const admin = await createAdmin();
    await createUser({ email: 'cliente-admin-list@test.com' });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users[0].password_hash).toBeUndefined();
    expect(res.body.users[0].document_number).toBeUndefined();
  });

  it('cria usuario admin pelo painel administrativo', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        full_name: 'Novo Admin',
        email: 'novo-admin@test.com',
        password: 'senha123',
        role: 'admin',
      });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('admin');
    expect(res.body.password_hash).toBeUndefined();
  });

  it('nao deixa admin remover a propria conta', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .delete(`/api/admin/users/${admin.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(400);
  });

  it('lista imoveis usando created_by/is_active do schema real', async () => {
    const admin = await createAdmin();
    const host = await createUser({ role: 'host', email: 'host-admin-prop@test.com' });
    await createProperty(host.token, { title: 'Imovel Admin Schema' });

    const res = await request(app)
      .get('/api/admin/properties?status=active')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.properties.some((property) => property.title === 'Imovel Admin Schema')).toBe(true);
    expect(res.body.properties[0].owner_id).toBeDefined();
    expect(res.body.properties[0].status).toBe('active');
  });

  it('lista reservas e pagamentos com aliases esperados pelo painel', async () => {
    const admin = await createAdmin();
    const host = await createUser({ role: 'host', email: 'host-admin-flow@test.com' });
    const guest = await createUser({ email: 'guest-admin-flow@test.com' });
    const property = await createProperty(host.token, { title: 'Casa Fluxo Admin', price_per_night: 200 });
    const reservation = await createReservation(guest.token, property.id);

    await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${guest.token}`)
      .send({ reservation_id: reservation.id, card_last4: '4242' });

    const reservationsRes = await request(app)
      .get('/api/admin/reservations')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(reservationsRes.status).toBe(200);
    expect(reservationsRes.body.reservations[0].property_title).toBeDefined();
    expect(reservationsRes.body.reservations[0].created_at).toBeDefined();

    const paymentsRes = await request(app)
      .get('/api/admin/payments')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(paymentsRes.status).toBe(200);
    expect(paymentsRes.body.payments[0].amount).toBeDefined();
    expect(paymentsRes.body.payments[0].created_at).toBeDefined();
  });
});
