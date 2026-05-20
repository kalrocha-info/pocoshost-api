import { pool } from '../db/pool.js';
import { sendServerError } from '../utils/http.js';
import { findOrCreateCustomer, createCreditCardPayment, mapAsaasStatus } from '../services/asaasService.js';

export async function list(req, res) {
  const { role } = req.query;
  const params = [role === 'host' ? req.user.email : req.user.email];
  const col = role === 'host' ? 'host_email' : 'guest_email';
  try {
    const result = await pool.query(
      `SELECT * FROM payments WHERE ${col} = $1 ORDER BY created_date DESC`, params
    );
    res.json(result.rows);
  } catch (err) {
    sendServerError(res, err);
  }
}

function normalizeCardNumber(value) {
  return value?.replace(/\D/g, '') ?? '';
}

export async function create(req, res) {
  const {
    reservation_id,
    card_last4,
    card_number,
    card_holder_name,
    card_expiry,
    card_cvv,
  } = req.body;

  if (!reservation_id) return res.status(400).json({ error: 'reservation_id é obrigatório.' });

  try {
    const resv = await pool.query('SELECT * FROM reservations WHERE id = $1', [reservation_id]);
    if (!resv.rows[0]) return res.status(404).json({ error: 'Reserva não encontrada.' });
    const r = resv.rows[0];

    if (r.guest_id !== req.user.id) {
      return res.status(403).json({ error: 'Sem permissão para pagar esta reserva.' });
    }

    const existing = await pool.query('SELECT * FROM payments WHERE reservation_id = $1', [reservation_id]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'Esta reserva já possui pagamento registrado.' });
    }

    let paymentStatus = 'paid';
    let gatewayStatus = null;
    let gatewayPaymentId = null;

    const hasCardData = card_number || card_holder_name || card_expiry || card_cvv;
    if (hasCardData) {
      const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
      const guest = userResult.rows[0];
      const customer = await findOrCreateCustomer({
        name: guest.full_name,
        email: guest.email,
        cpf: guest.document_number,
        phone: guest.phone,
      });

      const asaasPayment = await createCreditCardPayment({
        customer,
        reservation: {
          id: r.id,
          totalPrice: Number(r.total_price),
          propertyName: r.property_title,
          description: r.property_title,
        },
        cardData: {
          holderName: card_holder_name,
          number: normalizeCardNumber(card_number),
          expiry: card_expiry,
          cvv: card_cvv,
        },
        hostWalletId: process.env.ASAAS_WALLET_POCOSHOST,
      });

      gatewayStatus = asaasPayment.status;
      gatewayPaymentId = asaasPayment.id;
      paymentStatus = mapAsaasStatus(asaasPayment.status);
    }

    const insertResult = await pool.query(
      `INSERT INTO payments
         (reservation_id, property_title, guest_email, host_email,
          total_amount, platform_fee, host_net, card_last4, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        reservation_id,
        r.property_title,
        r.guest_email,
        r.host_email,
        r.total_price,
        r.platform_fee,
        r.host_net,
        card_last4 ?? null,
        paymentStatus,
      ]
    );

    if (paymentStatus === 'paid') {
      await pool.query(
        `UPDATE reservations SET status = 'confirmed', updated_date = NOW() WHERE id = $1`,
        [reservation_id]
      );
    }

    res.status(201).json({
      ...insertResult.rows[0],
      gateway_status: gatewayStatus,
      gateway_payment_id: gatewayPaymentId,
    });
  } catch (err) {
    sendServerError(res, err);
  }
}
