import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../testApp.js';
import { pool } from '../db/pool.js';
import { approveReservation, createUser, createProperty, createReservation } from './helpers/factories.js';
import { creditCardPaymentPayload } from './helpers/paymentPayload.js';

const app = createApp();

async function createAdmin(overrides = {}) {
  const password = overrides.password ?? 'senha123';
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role, email_verified, email_verified_at)
     VALUES ($1, $2, $3, 'admin', TRUE, NOW())
     RETURNING id, email, full_name, role, email_verified`,
    [overrides.full_name ?? 'Admin Teste', overrides.email ?? `admin_${Date.now()}@example.test`, passwordHash]
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
    await createUser({ email: 'cliente-admin-list@example.test' });

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
        email: 'novo-admin@example.test',
        password: 'senha123',
        role: 'admin',
      });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('admin');
    expect(res.body.password_hash).toBeUndefined();

    const login = await request(app).post('/api/auth/login').send({
      email: 'novo-admin@example.test',
      password: 'senha123',
    });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('admin');
  });

  it('nao deixa admin remover a propria conta', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .delete(`/api/admin/users/${admin.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(400);
  });

  it('nao deixa admin bloquear a propria conta', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .put(`/api/admin/users/${admin.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ account_status: 'blocked' });

    expect(res.status).toBe(400);
  });

  it('bloqueia e desbloqueia usuario pelo painel administrativo', async () => {
    const admin = await createAdmin();
    const guest = await createUser({ email: 'guest-block-admin@example.test' });

    const blocked = await request(app)
      .put(`/api/admin/users/${guest.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ account_status: 'blocked' });

    expect(blocked.status).toBe(200);
    expect(blocked.body.account_status).toBe('blocked');

    const unblocked = await request(app)
      .put(`/api/admin/users/${guest.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ account_status: 'active' });

    expect(unblocked.status).toBe(200);
    expect(unblocked.body.account_status).toBe('active');
  });

  it('permite configurar wallet Asaas de anfitrião pelo painel', async () => {
    const admin = await createAdmin();
    const host = await createUser({ role: 'host', email: 'host-wallet-admin@example.test', asaas_wallet_id: null });
    const res = await request(app)
      .put(`/api/admin/hosts/${host.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ asaas_wallet_id: 'wal_host_admin_test' });

    expect(res.status).toBe(200);
    expect(res.body.asaas_wallet_id).toBe('wal_host_admin_test');
  });

  it('bloqueia anfitriao pelo painel administrativo', async () => {
    const admin = await createAdmin();
    const host = await createUser({ role: 'host', email: 'host-block-admin@example.test' });

    const res = await request(app)
      .put(`/api/admin/hosts/${host.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ account_status: 'blocked' });

    expect(res.status).toBe(200);
    expect(res.body.account_status).toBe('blocked');
  });

  it('bloqueio de anfitriao oculta imoveis publicos e impede nova reserva', async () => {
    const admin = await createAdmin();
    const host = await createUser({ role: 'host', email: 'host-block-public@example.test' });
    const guest = await createUser({ email: 'guest-block-public@example.test' });
    const property = await createProperty(host.token, { title: 'Imovel Anfitriao Bloqueado' });

    await request(app)
      .put(`/api/admin/hosts/${host.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ account_status: 'blocked' });

    const detail = await request(app).get(`/api/properties/${property.id}`);
    expect(detail.status).toBe(404);

    const reservation = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${guest.token}`)
      .send({
        property_id: property.id,
        check_in: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        check_out: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
        guests: 1,
      });
    expect(reservation.status).toBe(409);
  });

  it('lista imoveis usando created_by/is_active do schema real', async () => {
    const admin = await createAdmin();
    const host = await createUser({ role: 'host', email: 'host-admin-prop@example.test' });
    await createProperty(host.token, { title: 'Imovel Admin Schema' });

    const res = await request(app)
      .get('/api/admin/properties?status=active')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.properties.some((property) => property.title === 'Imovel Admin Schema')).toBe(true);
    expect(res.body.properties[0].owner_id).toBeDefined();
    expect(res.body.properties[0].status).toBe('active');
  });

  it('nao remove imovel com reserva ativa', async () => {
    const admin = await createAdmin();
    const host = await createUser({ role: 'host', email: 'host-delete-prop@example.test' });
    const guest = await createUser({ email: 'guest-delete-prop@example.test' });
    const property = await createProperty(host.token, { title: 'Imovel com reserva ativa' });
    await createReservation(guest.token, property.id);

    const res = await request(app)
      .delete(`/api/admin/properties/${property.id}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reservas ativas/i);
  });

  it('lista reservas e pagamentos com aliases esperados pelo painel', async () => {
    const admin = await createAdmin();
    const host = await createUser({ role: 'host', email: 'host-admin-flow@example.test' });
    const guest = await createUser({ email: 'guest-admin-flow@example.test' });
    const property = await createProperty(host.token, { title: 'Casa Fluxo Admin', price_per_night: 200 });
    const reservation = await createReservation(guest.token, property.id);
    await approveReservation(reservation.id);

    await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${guest.token}`)
      .send(creditCardPaymentPayload(reservation.id, { card_last4: '4242' }));

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
