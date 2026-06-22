import { pool } from '../db/pool.js';
import { sendServerError } from '../utils/http.js';
import {
  sendReservationConfirmationToGuest,
  sendReservationConfirmationToHost,
} from '../services/emailService.js';

function mapWebhookPaymentStatus(status) {
  const normalized = String(status).toUpperCase();
  if (['CONFIRMED', 'RECEIVED'].includes(normalized)) return 'paid';
  if (['CANCELLED', 'REFUNDED', 'FAILED'].includes(normalized)) return 'refunded';
  if (['PENDING', 'IN_ANALYSIS', 'DRAFT'].includes(normalized)) return 'pending';
  return null;
}

export async function asaas(req, res) {
  try {
    if (!process.env.ASAAS_WEBHOOK_TOKEN) {
      return res.status(503).json({ error: 'Webhook indisponível.' });
    }
    const token = req.headers['asaas-access-token'] || req.headers['x-asaas-access-token'];
    if (token !== process.env.ASAAS_WEBHOOK_TOKEN) {
      return res.status(403).json({ error: 'Token ASAAS inválido.' });
    }

    const payment = req.body?.payment;
    if (!payment || typeof payment.externalReference !== 'string') {
      return res.status(200).json({ success: true, message: 'Webhook ASAAS recebido sem payment.externalReference.' });
    }

    const match = payment.externalReference.match(/^reservation_(.+)$/);
    if (!match) {
      return res.status(200).json({ success: true, message: 'externalReference fora do formato esperado.' });
    }

    const reservationId = match[1];
    const reservationResult = await pool.query('SELECT * FROM reservations WHERE id = $1', [reservationId]);
    const reservation = reservationResult.rows[0];
    if (!reservation) {
      return res.status(404).json({ error: 'Reserva não encontrada para webhook ASAAS.' });
    }

    const expiredNow =
      reservation.status === 'pending' &&
      new Date(reservation.expires_at).getTime() <= Date.now();

    if (expiredNow) {
      await pool.query(
        `UPDATE reservations
            SET status = 'cancelled', expired_at = COALESCE(expired_at, NOW()), updated_date = NOW()
          WHERE id = $1`,
        [reservationId]
      );
    }

    const newStatus = ['CONFIRMED', 'RECEIVED'].includes(payment.status)
      ? 'confirmed'
      : ['CANCELLED', 'REFUNDED', 'FAILED'].includes(payment.status)
      ? 'cancelled'
      : null;
    const paymentStatus = mapWebhookPaymentStatus(payment.status);

    await pool.query(
      `UPDATE payments
       SET status = COALESCE($1, status),
           gateway_payment_id = COALESCE($2, gateway_payment_id),
           gateway_status = COALESCE($3, gateway_status),
           billing_type = COALESCE($4, billing_type),
           updated_date = NOW()
       WHERE reservation_id = $5`,
      [paymentStatus, payment.id ?? null, payment.status ?? null, payment.billingType ?? null, reservationId]
    );

    if (reservation.expired_at || expiredNow) {
      return res.status(200).json({
        success: true,
        message: 'Pagamento recebido para reserva expirada; reserva não foi reativada.',
      });
    }

    if (newStatus && reservation.status !== newStatus) {
      await pool.query(
        'UPDATE reservations SET status = $1, updated_date = NOW() WHERE id = $2',
        [newStatus, reservationId]
      );

      if (newStatus === 'confirmed') {
        const updatedReservation = { ...reservation, status: 'confirmed' };

        // Disparar e-mails de confirmação de forma assíncrona (não-bloqueante)
        sendReservationConfirmationToGuest(updatedReservation).catch((err) => {
          console.error('[Webhook Asaas] Erro ao enviar e-mail ao hóspede:', err);
        });

        sendReservationConfirmationToHost(updatedReservation).catch((err) => {
          console.error('[Webhook Asaas] Erro ao enviar e-mail ao anfitrião:', err);
        });
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return sendServerError(res, err);
  }
}
