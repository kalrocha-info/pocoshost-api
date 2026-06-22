import request from 'supertest';
import { createApp } from '../testApp.js';
import { approveReservation, createUser, createProperty, createReservation } from './helpers/factories.js';
import { pixPaymentPayload } from './helpers/paymentPayload.js';
import { pool } from '../db/pool.js';
import {
  sendReservationConfirmationToGuestSpy,
  sendReservationConfirmationToHostSpy,
} from './helpers/mockEmail.js';

const app = createApp();
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN ?? 'test-webhook-token-secret';

// ─── Helpers de payload ────────────────────────────────────────────────────

/**
 * Constrói um payload real do Asaas para o evento de pagamento.
 * Baseado na documentação oficial: https://docs.asaas.com/reference/webhooks
 */
function buildAsaasPayload(externalReference, paymentStatus, overrides = {}) {
  return {
    event: 'PAYMENT_CONFIRMED',
    payment: {
      id: `pay_${Date.now()}`,
      dateCreated: new Date().toISOString().split('T')[0],
      customer: 'cus_test_mock_001',
      value: 300.00,
      netValue: 253.50,
      billingType: 'CREDIT_CARD',
      status: paymentStatus,
      externalReference,
      description: 'Reserva PoçosHost',
      ...overrides,
    },
  };
}

function futureDate(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// ─── Suíte de testes ──────────────────────────────────────────────────────

describe('WEBHOOKS — /api/webhooks/asaas', () => {

  describe('Autenticação do webhook', () => {
    it('rejeita configuração ausente do token (503)', async () => {
      const previousToken = process.env.ASAAS_WEBHOOK_TOKEN;
      delete process.env.ASAAS_WEBHOOK_TOKEN;
      const res = await request(app)
        .post('/api/webhooks/asaas')
        .send({ event: 'PAYMENT_UPDATED', payment: null });
      process.env.ASAAS_WEBHOOK_TOKEN = previousToken;
      expect(res.status).toBe(503);
    });

    it('rejeita requisição sem token (403)', async () => {
      const res = await request(app)
        .post('/api/webhooks/asaas')
        .send(buildAsaasPayload('reservation_any-id', 'CONFIRMED'));
      expect(res.status).toBe(403);
    });

    it('rejeita token inválido (403)', async () => {
      const res = await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', 'token-errado-hacker')
        .send(buildAsaasPayload('reservation_any-id', 'CONFIRMED'));
      expect(res.status).toBe(403);
    });

    it('aceita token via header asaas-access-token (200)', async () => {
      const res = await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send({ event: 'PAYMENT_UPDATED', payment: null });
      expect(res.status).toBe(200);
    });

    it('aceita token via header x-asaas-access-token (200)', async () => {
      const res = await request(app)
        .post('/api/webhooks/asaas')
        .set('x-asaas-access-token', WEBHOOK_TOKEN)
        .send({ event: 'PAYMENT_UPDATED', payment: null });
      expect(res.status).toBe(200);
    });
  });

  describe('Payloads malformados', () => {
    it('responde 200 quando payment é null (evento não-pagamento)', async () => {
      const res = await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send({ event: 'PAYMENT_DELETED', payment: null });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('responde 200 quando externalReference está ausente', async () => {
      const res = await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send({
          event: 'PAYMENT_CONFIRMED',
          payment: { id: 'pay_no_ref', status: 'CONFIRMED' },
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('responde 200 quando externalReference não segue o formato reservation_*', async () => {
      const res = await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(buildAsaasPayload('order_12345', 'CONFIRMED'));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('retorna 404 quando reservation_id não existe no banco', async () => {
      const res = await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(buildAsaasPayload('reservation_00000000-0000-0000-0000-000000000000', 'CONFIRMED'));
      expect(res.status).toBe(404);
    });
  });

  describe('Evento PAYMENT_CONFIRMED — status CONFIRMED', () => {
    it('atualiza reserva para "confirmed" e retorna 200', async () => {
      const host = await createUser({ email: 'wh_host1@example.test' });
      const guest = await createUser({ email: 'wh_guest1@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id, {
        check_in: futureDate(1),
        check_out: futureDate(3),
      });

      const res = await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(buildAsaasPayload(`reservation_${resv.id}`, 'CONFIRMED'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verifica que o status foi atualizado no banco
      const check = await request(app)
        .get(`/api/reservations/${resv.id}`)
        .set('Authorization', `Bearer ${guest.token}`);
      expect(check.body.status).toBe('confirmed');
    });


    it('atualiza pagamento existente com dados de gateway do webhook', async () => {
      const host = await createUser({ email: 'wh_host_pay@example.test' });
      const guest = await createUser({ email: 'wh_guest_pay@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id, {
        check_in: futureDate(1),
        check_out: futureDate(3),
      });
      await approveReservation(resv.id);

      await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`)
        .send(pixPaymentPayload(resv.id));

      const res = await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(buildAsaasPayload(`reservation_${resv.id}`, 'CONFIRMED', {
          id: 'pay_pix_test_mock',
          billingType: 'PIX',
        }));

      expect(res.status).toBe(200);

      const payments = await request(app)
        .get('/api/payments')
        .set('Authorization', `Bearer ${guest.token}`);

      expect(payments.body).toHaveLength(1);
      expect(payments.body[0].status).toBe('paid');
      expect(payments.body[0].gateway_payment_id).toBe('pay_pix_test_mock');
      expect(payments.body[0].gateway_status).toBe('CONFIRMED');
      expect(payments.body[0].billing_type).toBe('PIX');
    });
    it('dispara e-mail de confirmação ao hóspede', async () => {
      sendReservationConfirmationToGuestSpy.mockClear();

      const host = await createUser({ email: 'wh_host2@example.test' });
      const guest = await createUser({ email: 'wh_guest2@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id, {
        check_in: futureDate(2),
        check_out: futureDate(4),
      });

      await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(buildAsaasPayload(`reservation_${resv.id}`, 'CONFIRMED'));

      // Aguarda o disparo assíncrono do e-mail
      await new Promise((r) => setTimeout(r, 50));
      expect(sendReservationConfirmationToGuestSpy).toHaveBeenCalledOnce();
    });

    it('dispara e-mail de confirmação ao anfitrião', async () => {
      sendReservationConfirmationToHostSpy.mockClear();

      const host = await createUser({ email: 'wh_host3@example.test' });
      const guest = await createUser({ email: 'wh_guest3@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id, {
        check_in: futureDate(5),
        check_out: futureDate(7),
      });

      await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(buildAsaasPayload(`reservation_${resv.id}`, 'CONFIRMED'));

      await new Promise((r) => setTimeout(r, 50));
      expect(sendReservationConfirmationToHostSpy).toHaveBeenCalledOnce();
    });
  });

  describe('Evento PAYMENT_RECEIVED — status RECEIVED', () => {
    it('também confirma reserva com status RECEIVED', async () => {
      const host = await createUser({ email: 'wh_host4@example.test' });
      const guest = await createUser({ email: 'wh_guest4@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id, {
        check_in: futureDate(1),
        check_out: futureDate(3),
      });

      const res = await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(buildAsaasPayload(`reservation_${resv.id}`, 'RECEIVED', { event: 'PAYMENT_RECEIVED' }));

      expect(res.status).toBe(200);
      const check = await request(app)
        .get(`/api/reservations/${resv.id}`)
        .set('Authorization', `Bearer ${guest.token}`);
      expect(check.body.status).toBe('confirmed');
    });
  });

  describe('Eventos de cancelamento — CANCELLED / REFUNDED / FAILED', () => {
    it('cancela reserva quando status é CANCELLED', async () => {
      const host = await createUser({ email: 'wh_host5@example.test' });
      const guest = await createUser({ email: 'wh_guest5@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id, {
        check_in: futureDate(1),
        check_out: futureDate(3),
      });

      const res = await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(buildAsaasPayload(`reservation_${resv.id}`, 'CANCELLED', { event: 'PAYMENT_CANCELLED' }));

      expect(res.status).toBe(200);
      const check = await request(app)
        .get(`/api/reservations/${resv.id}`)
        .set('Authorization', `Bearer ${guest.token}`);
      expect(check.body.status).toBe('cancelled');
    });

    it('cancela reserva quando status é REFUNDED', async () => {
      const host = await createUser({ email: 'wh_host6@example.test' });
      const guest = await createUser({ email: 'wh_guest6@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id, {
        check_in: futureDate(1),
        check_out: futureDate(3),
      });

      await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(buildAsaasPayload(`reservation_${resv.id}`, 'REFUNDED', { event: 'PAYMENT_REFUNDED' }));

      const check = await request(app)
        .get(`/api/reservations/${resv.id}`)
        .set('Authorization', `Bearer ${guest.token}`);
      expect(check.body.status).toBe('cancelled');
    });

    it('cancela reserva quando status é FAILED', async () => {
      const host = await createUser({ email: 'wh_host7@example.test' });
      const guest = await createUser({ email: 'wh_guest7@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id, {
        check_in: futureDate(1),
        check_out: futureDate(3),
      });

      await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(buildAsaasPayload(`reservation_${resv.id}`, 'FAILED', { event: 'PAYMENT_FAILED' }));

      const check = await request(app)
        .get(`/api/reservations/${resv.id}`)
        .set('Authorization', `Bearer ${guest.token}`);
      expect(check.body.status).toBe('cancelled');
    });

    it('NÃO dispara e-mail de confirmação ao cancelar', async () => {
      sendReservationConfirmationToGuestSpy.mockClear();
      sendReservationConfirmationToHostSpy.mockClear();

      const host = await createUser({ email: 'wh_host8@example.test' });
      const guest = await createUser({ email: 'wh_guest8@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id, {
        check_in: futureDate(1),
        check_out: futureDate(3),
      });

      await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(buildAsaasPayload(`reservation_${resv.id}`, 'CANCELLED', { event: 'PAYMENT_CANCELLED' }));

      await new Promise((r) => setTimeout(r, 50));
      expect(sendReservationConfirmationToGuestSpy).not.toHaveBeenCalled();
      expect(sendReservationConfirmationToHostSpy).not.toHaveBeenCalled();
    });
  });

  describe('Idempotência — duplicação de eventos', () => {
    it('não reenvia e-mails se reserva já estava confirmada (idempotente)', async () => {
      sendReservationConfirmationToGuestSpy.mockClear();

      const host = await createUser({ email: 'wh_host9@example.test' });
      const guest = await createUser({ email: 'wh_guest9@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id, {
        check_in: futureDate(1),
        check_out: futureDate(3),
      });

      const payload = buildAsaasPayload(`reservation_${resv.id}`, 'CONFIRMED');

      // Primeiro disparo — confirma a reserva
      await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(payload);

      await new Promise((r) => setTimeout(r, 50));
      expect(sendReservationConfirmationToGuestSpy).toHaveBeenCalledTimes(1);

      sendReservationConfirmationToGuestSpy.mockClear();

      // Segundo disparo idêntico — reserva já está confirmada, não deve reenviar
      await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(payload);

      await new Promise((r) => setTimeout(r, 50));
      expect(sendReservationConfirmationToGuestSpy).not.toHaveBeenCalled();
    });
  });

  describe('Reserva expirada', () => {
    it('não reativa reserva expirada ao receber confirmação tardia', async () => {
      const host = await createUser({ email: 'wh_expired_host@example.test' });
      const guest = await createUser({ email: 'wh_expired_guest@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);
      await pool.query(
        `UPDATE reservations SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
        [resv.id]
      );

      const res = await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(buildAsaasPayload(`reservation_${resv.id}`, 'CONFIRMED'));

      expect(res.status).toBe(200);
      const stored = await pool.query('SELECT status, expired_at FROM reservations WHERE id = $1', [resv.id]);
      expect(stored.rows[0].status).toBe('cancelled');
      expect(stored.rows[0].expired_at).toBeTruthy();
    });
  });

  describe('Status desconhecido', () => {
    it('ignora status desconhecido sem alterar a reserva (200)', async () => {
      const host = await createUser({ email: 'wh_host10@example.test' });
      const guest = await createUser({ email: 'wh_guest10@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id, {
        check_in: futureDate(1),
        check_out: futureDate(3),
      });

      const res = await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(buildAsaasPayload(`reservation_${resv.id}`, 'PENDING'));

      expect(res.status).toBe(200);

      // Status da reserva deve continuar 'pending' (não alterado)
      const check = await request(app)
        .get(`/api/reservations/${resv.id}`)
        .set('Authorization', `Bearer ${guest.token}`);
      expect(check.body.status).toBe('pending');
    });
  });
});

