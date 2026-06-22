import request from 'supertest';
import { createApp } from '../testApp.js';
import { approveReservation, createUser, createProperty, createReservation } from './helpers/factories.js';
import { creditCardPaymentPayload, pixPaymentPayload } from './helpers/paymentPayload.js';
import { createCreditCardPayment } from '../services/asaasService.js';
import { pool } from '../db/pool.js';

const app = createApp();

function futureDate(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

describe('PAYMENTS — /api/payments', () => {
  describe('POST / — criar pagamento', () => {
    it('cria pagamento e confirma reserva automaticamente', async () => {
      const host = await createUser({ email: 'ph@example.test' });
      const guest = await createUser({ email: 'pg@example.test' });
      const prop = await createProperty(host.token, { price_per_night: 500 });
      const resv = await createReservation(guest.token, prop.id, {
        check_in: futureDate(1),
        check_out: futureDate(2),
      });
      await approveReservation(resv.id);
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send(creditCardPaymentPayload(resv.id, { card_last4: '1234' }));
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('paid');
      expect(Number(res.body.total_amount)).toBe(500);
      expect(Number(res.body.platform_fee)).toBeCloseTo(77.5, 1);
      expect(Number(res.body.host_net)).toBeCloseTo(422.5, 1);
      expect(res.body.card_last4).toBe('1234');
      expect(res.body.billing_type).toBe('CREDIT_CARD');
      expect(res.body.gateway_payment_id).toBe('pay_cc_test_mock');
      expect(res.body.gateway_status).toBe('CONFIRMED');
    });

    it('repassa cartão ao gateway sem retornar ou persistir PAN/CVV', async () => {
      const host = await createUser({
        email: 'ph-card-scope@example.test',
        asaas_wallet_id: 'wal_host_card_scope',
      });
      const guest = await createUser({ email: 'pg-card-scope@example.test' });
      const prop = await createProperty(host.token, { price_per_night: 500 });
      const resv = await createReservation(guest.token, prop.id);
      await approveReservation(resv.id);
      const payload = creditCardPaymentPayload(resv.id, {
        card_number: '4111111111111111',
        card_cvv: '987',
        card_last4: '1111',
      });

      createCreditCardPayment.mockClear();
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(createCreditCardPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          cardData: expect.objectContaining({
            number: '4111111111111111',
            cvv: '987',
          }),
          hostWalletId: 'wal_host_card_scope',
        })
      );
      expect(res.body).not.toHaveProperty('card_number');
      expect(res.body).not.toHaveProperty('card_cvv');
      expect(JSON.stringify(res.body)).not.toContain('4111111111111111');
      expect(JSON.stringify(res.body)).not.toContain('987');

      const stored = await pool.query(
        'SELECT * FROM payments WHERE reservation_id = $1',
        [resv.id]
      );
      expect(stored.rows[0]).toHaveProperty('card_last4', '1111');
      expect(JSON.stringify(stored.rows[0])).not.toContain('4111111111111111');
      expect(JSON.stringify(stored.rows[0])).not.toContain('987');
    });

    it('usa a wallet do dono atual do imóvel mesmo se a reserva tiver host_email legado', async () => {
      const host = await createUser({
        email: 'ph-owner-wallet@example.test',
        asaas_wallet_id: 'wal_owner_current',
      });
      const guest = await createUser({ email: 'pg-owner-wallet@example.test' });
      const prop = await createProperty(host.token, { price_per_night: 500 });
      const resv = await createReservation(guest.token, prop.id);
      await approveReservation(resv.id);

      await pool.query('UPDATE reservations SET host_email = $1 WHERE id = $2', [
        'old-host@example.test',
        resv.id,
      ]);

      createCreditCardPayment.mockClear();
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send(creditCardPaymentPayload(resv.id));

      expect(res.status).toBe(201);
      expect(createCreditCardPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          hostWalletId: 'wal_owner_current',
        })
      );
      expect(res.body.host_email).toBe('ph-owner-wallet@example.test');
    });

    it('confirma a reserva após pagamento', async () => {
      const host = await createUser({ email: 'ph2@example.test' });
      const guest = await createUser({ email: 'pg2@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);
      await approveReservation(resv.id);
      await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send(creditCardPaymentPayload(resv.id));
      const check = await request(app)
        .get(`/api/reservations/${resv.id}`)
        .set('Authorization', `Bearer ${guest.token}`);
      expect(check.body.status).toBe('confirmed');
    });

    it('cria pagamento PIX com status pending e dados de QR', async () => {
      const host = await createUser({ email: 'ph-pix@example.test' });
      const guest = await createUser({ email: 'pg-pix@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);
      await approveReservation(resv.id);
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send(pixPaymentPayload(resv.id));
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
      expect(res.body.gateway_pix_qrcode).toBeTruthy();
      expect(res.body.gateway_pix_payload).toContain('mock-pix');
      expect(res.body.billing_type).toBe('PIX');
      expect(res.body.gateway_payment_id).toBe('pay_pix_test_mock');
      expect(res.body.gateway_status).toBe('PENDING');
    });

    it('rejeita pagamento quando anfitrião não possui wallet Asaas', async () => {
      const host = await createUser({ email: 'ph-no-wallet@example.test', asaas_wallet_id: null });
      const guest = await createUser({ email: 'pg-no-wallet@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);
      await approveReservation(resv.id);
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send(pixPaymentPayload(resv.id));
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Anfitrião ainda não está habilitado/);
    });

    it('retorna mensagem operacional quando o Asaas rejeita o pagamento', async () => {
      const host = await createUser({ email: 'ph-asaas-error@example.test' });
      const guest = await createUser({ email: 'pg-asaas-error@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);
      await approveReservation(resv.id);
      const gatewayError = Object.assign(
        new Error('Pagamento recusado pelo Asaas: walletId inválido.'),
        {
          status: 422,
          code: 'ASAAS_REQUEST_REJECTED',
          publicMessage: 'Pagamento recusado pelo Asaas: walletId inválido.',
        }
      );
      createCreditCardPayment.mockRejectedValueOnce(gatewayError);

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send(creditCardPaymentPayload(resv.id));

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/walletId inválido/i);
      expect(res.body.code).toBe('ASAAS_REQUEST_REJECTED');
    });

    it('rejeita pagamento de reserva pendente expirada', async () => {
      const host = await createUser({ email: 'ph-expired@example.test' });
      const guest = await createUser({ email: 'pg-expired@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);
      await approveReservation(resv.id);
      await pool.query(
        `UPDATE reservations SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
        [resv.id]
      );

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send(creditCardPaymentPayload(resv.id));

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/prazo de 30 minutos/i);
      const stored = await pool.query('SELECT status, expired_at FROM reservations WHERE id = $1', [resv.id]);
      expect(stored.rows[0].status).toBe('cancelled');
      expect(stored.rows[0].expired_at).toBeTruthy();
    });

    it('rejeita pagamento sem dados de cartão quando billing_type é CREDIT_CARD', async () => {
      const host = await createUser({ email: 'ph-no-card@example.test' });
      const guest = await createUser({ email: 'pg-no-card@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);
      await approveReservation(resv.id);
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ reservation_id: resv.id, card_last4: '1234' });
      expect(res.status).toBe(400);
    });

    it('rejeita pagamento sem reservation_id', async () => {
      const { token } = await createUser({ email: 'pg3@example.test' });
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('rejeita pagamento para reserva inexistente', async () => {
      const { token } = await createUser({ email: 'pg4@example.test' });
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${token}`)
        .send(creditCardPaymentPayload('00000000-0000-0000-0000-000000000000'));
      expect(res.status).toBe(404);
    });

    it('rejeita sem autenticação', async () => {
      const res = await request(app).post('/api/payments').send({ reservation_id: 'qualquer' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET / — listagem', () => {
    it('lista pagamentos do hóspede', async () => {
      const host = await createUser({ email: 'lph@example.test' });
      const guest = await createUser({ email: 'lpg@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);
      await approveReservation(resv.id);
      await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send(creditCardPaymentPayload(resv.id));
      const res = await request(app)
        .get('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].gateway_payment_id).toBe('pay_cc_test_mock');
      expect(res.body[0].gateway_status).toBe('CONFIRMED');
    });

    it('lista pagamentos do anfitrião com role=host', async () => {
      const host = await createUser({ email: 'lph2@example.test' });
      const guest = await createUser({ email: 'lpg2@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);
      await approveReservation(resv.id);
      await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send(creditCardPaymentPayload(resv.id));
      const res = await request(app)
        .get('/api/payments?role=host')
        .set('Authorization', `Bearer ${host.token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].gateway_payment_id).toBe('pay_cc_test_mock');
      expect(res.body[0].gateway_status).toBe('CONFIRMED');
    });

    it('rejeita sem autenticação', async () => {
      const res = await request(app).get('/api/payments');
      expect(res.status).toBe(401);
    });
  });
});
