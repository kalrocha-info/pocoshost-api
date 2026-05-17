import request from 'supertest';
import { createApp } from '../testApp.js';
import { createUser, createProperty, createReservation } from './helpers/factories.js';

const app = createApp();

function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

describe('RESERVATIONS — /api/reservations', () => {

  describe('POST / — criação', () => {
    it('cria reserva com dados válidos', async () => {
      const host = await createUser({ email: 'host@r.com' });
      const guest = await createUser({ email: 'guest@r.com' });
      const prop = await createProperty(host.token);
      const res = await request(app).post('/api/reservations')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ property_id: prop.id, check_in: futureDate(1), check_out: futureDate(4), guests: 2 });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
      expect(Number(res.body.platform_fee)).toBeCloseTo(Number(res.body.total_price) * 0.155, 1);
    });

    it('calcula taxa de 15,5% corretamente', async () => {
      const host = await createUser({ email: 'host2@r.com' });
      const guest = await createUser({ email: 'guest2@r.com' });
      const prop = await createProperty(host.token, { price_per_night: 1000 });
      const res = await request(app).post('/api/reservations')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ property_id: prop.id, check_in: futureDate(1), check_out: futureDate(2), guests: 1 });
      expect(res.status).toBe(201);
      expect(Number(res.body.total_price)).toBe(1000);
      expect(Number(res.body.platform_fee)).toBe(155);
      expect(Number(res.body.host_net)).toBe(845);
    });

    it('rejeita datas em conflito (409)', async () => {
      const host = await createUser({ email: 'host3@r.com' });
      const guest = await createUser({ email: 'guest3@r.com' });
      const prop = await createProperty(host.token);
      await createReservation(guest.token, prop.id, { check_in: futureDate(1), check_out: futureDate(5) });
      const res = await request(app).post('/api/reservations')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ property_id: prop.id, check_in: futureDate(2), check_out: futureDate(4), guests: 1 });
      expect(res.status).toBe(409);
    });

    it('rejeita datas parcialmente sobrepostas', async () => {
      const host = await createUser({ email: 'host4@r.com' });
      const guest = await createUser({ email: 'guest4@r.com' });
      const prop = await createProperty(host.token);
      await createReservation(guest.token, prop.id, { check_in: futureDate(3), check_out: futureDate(7) });
      const res = await request(app).post('/api/reservations')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ property_id: prop.id, check_in: futureDate(1), check_out: futureDate(5), guests: 1 });
      expect(res.status).toBe(409);
    });

    it('permite reservas em datas diferentes no mesmo imóvel', async () => {
      const host = await createUser({ email: 'host5@r.com' });
      const g1 = await createUser({ email: 'g1@r.com' });
      const g2 = await createUser({ email: 'g2@r.com' });
      const prop = await createProperty(host.token);
      await createReservation(g1.token, prop.id, { check_in: futureDate(1), check_out: futureDate(3) });
      const res = await request(app).post('/api/reservations')
        .set('Authorization', `Bearer ${g2.token}`)
        .send({ property_id: prop.id, check_in: futureDate(5), check_out: futureDate(8), guests: 1 });
      expect(res.status).toBe(201);
    });

    it('rejeita sem autenticação', async () => {
      const { token } = await createUser({ email: 'h6@r.com' });
      const prop = await createProperty(token);
      const res = await request(app).post('/api/reservations')
        .send({ property_id: prop.id, check_in: futureDate(1), check_out: futureDate(3), guests: 1 });
      expect(res.status).toBe(401);
    });

    it('rejeita property_id inexistente', async () => {
      const { token } = await createUser({ email: 'g7@r.com' });
      const res = await request(app).post('/api/reservations')
        .set('Authorization', `Bearer ${token}`)
        .send({ property_id: '00000000-0000-0000-0000-000000000000', check_in: futureDate(1), check_out: futureDate(3), guests: 1 });
      expect(res.status).toBe(404);
    });

    it('rejeita campos obrigatórios em falta', async () => {
      const { token } = await createUser({ email: 'g8@r.com' });
      const res = await request(app).post('/api/reservations')
        .set('Authorization', `Bearer ${token}`)
        .send({ check_in: futureDate(1) });
      expect(res.status).toBe(400);
    });
  });

  describe('GET / — listagem', () => {
    it('lista reservas do hóspede autenticado', async () => {
      const host = await createUser({ email: 'lh@r.com' });
      const guest = await createUser({ email: 'lg@r.com' });
      const prop = await createProperty(host.token);
      await createReservation(guest.token, prop.id);
      const res = await request(app).get('/api/reservations')
        .set('Authorization', `Bearer ${guest.token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    it('não mostra reservas de outros utilizadores', async () => {
      const host = await createUser({ email: 'lh2@r.com' });
      const g1 = await createUser({ email: 'lg2@r.com' });
      const g2 = await createUser({ email: 'lg3@r.com' });
      const prop = await createProperty(host.token);
      await createReservation(g1.token, prop.id);
      const res = await request(app).get('/api/reservations')
        .set('Authorization', `Bearer ${g2.token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(0);
    });
  });

  describe('PATCH /:id/status', () => {
    it('confirma reserva', async () => {
      const host = await createUser({ email: 'sh@r.com' });
      const guest = await createUser({ email: 'sg@r.com' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);
      const res = await request(app).patch(`/api/reservations/${resv.id}/status`)
        .set('Authorization', `Bearer ${host.token}`)
        .send({ status: 'confirmed' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('confirmed');
    });

    it('cancela reserva', async () => {
      const host = await createUser({ email: 'ch@r.com' });
      const guest = await createUser({ email: 'cg@r.com' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);
      const res = await request(app).patch(`/api/reservations/${resv.id}/status`)
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ status: 'cancelled' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
    });

    it('rejeita status inválido', async () => {
      const host = await createUser({ email: 'ih@r.com' });
      const guest = await createUser({ email: 'ig@r.com' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);
      const res = await request(app).patch(`/api/reservations/${resv.id}/status`)
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ status: 'hacked' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /availability', () => {
    it('indica disponível quando não há reservas', async () => {
      const { token } = await createUser({ email: 'av1@r.com' });
      const prop = await createProperty(token);
      const res = await request(app).get(
        `/api/reservations/availability?property_id=${prop.id}&check_in=${futureDate(1)}&check_out=${futureDate(3)}`
      );
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
    });

    it('indica indisponível quando há conflito', async () => {
      const host = await createUser({ email: 'av2h@r.com' });
      const guest = await createUser({ email: 'av2g@r.com' });
      const prop = await createProperty(host.token);
      await createReservation(guest.token, prop.id, { check_in: futureDate(1), check_out: futureDate(5) });
      const res = await request(app).get(
        `/api/reservations/availability?property_id=${prop.id}&check_in=${futureDate(2)}&check_out=${futureDate(4)}`
      );
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
    });
  });
});
