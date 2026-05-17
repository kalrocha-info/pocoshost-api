import request from 'supertest';
import { createApp } from '../testApp.js';
import { createUser, createProperty, createReservation } from './helpers/factories.js';

const app = createApp();

function futureDate(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

describe('PAYMENTS — /api/payments', () => {

  describe('POST / — criar pagamento', () => {
    it('cria pagamento e confirma reserva automaticamente', async () => {
      const host = await createUser({ email: 'ph@p.com' });
      const guest = await createUser({ email: 'pg@p.com' });
      const prop = await createProperty(host.token, { price_per_night: 500 });
      const resv = await createReservation(guest.token, prop.id, {
        check_in: futureDate(1), check_out: futureDate(2),
      });
      const res = await request(app).post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ reservation_id: resv.id, card_last4: '1234' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('paid');
      expect(Number(res.body.total_amount)).toBe(500);
      expect(Number(res.body.platform_fee)).toBeCloseTo(77.5, 1);
      expect(Number(res.body.host_net)).toBeCloseTo(422.5, 1);
      expect(res.body.card_last4).toBe('1234');
    });

    it('confirma a reserva após pagamento', async () => {
      const host = await createUser({ email: 'ph2@p.com' });
      const guest = await createUser({ email: 'pg2@p.com' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);
      await request(app).post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ reservation_id: resv.id });
      const check = await request(app).get(`/api/reservations/${resv.id}`)
        .set('Authorization', `Bearer ${guest.token}`);
      expect(check.body.status).toBe('confirmed');
    });

    it('rejeita pagamento sem reservation_id', async () => {
      const { token } = await createUser({ email: 'pg3@p.com' });
      const res = await request(app).post('/api/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('rejeita pagamento para reserva inexistente', async () => {
      const { token } = await createUser({ email: 'pg4@p.com' });
      const res = await request(app).post('/api/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ reservation_id: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(404);
    });

    it('rejeita sem autenticação', async () => {
      const res = await request(app).post('/api/payments').send({ reservation_id: 'qualquer' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET / — listagem', () => {
    it('lista pagamentos do hóspede', async () => {
      const host = await createUser({ email: 'lph@p.com' });
      const guest = await createUser({ email: 'lpg@p.com' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);
      await request(app).post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ reservation_id: resv.id });
      const res = await request(app).get('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    it('lista pagamentos do anfitrião com role=host', async () => {
      const host = await createUser({ email: 'lph2@p.com' });
      const guest = await createUser({ email: 'lpg2@p.com' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);
      await request(app).post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ reservation_id: resv.id });
      const res = await request(app).get('/api/payments?role=host')
        .set('Authorization', `Bearer ${host.token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    it('rejeita sem autenticação', async () => {
      const res = await request(app).get('/api/payments');
      expect(res.status).toBe(401);
    });
  });
});
