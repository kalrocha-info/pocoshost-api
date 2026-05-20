import { pool } from '../db/pool.js';
import { sendServerError } from '../utils/http.js';

export async function asaas(req, res) {
  try {
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

    const newStatus = ['CONFIRMED', 'RECEIVED'].includes(payment.status)
      ? 'confirmed'
      : ['CANCELLED', 'REFUNDED', 'FAILED'].includes(payment.status)
      ? 'cancelled'
      : null;

    if (newStatus && reservation.status !== newStatus) {
      await pool.query(
        'UPDATE reservations SET status = $1, updated_date = NOW() WHERE id = $2',
        [newStatus, reservationId]
      );
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return sendServerError(res, err);
  }
}
