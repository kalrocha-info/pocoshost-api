import { pool } from '../db/pool.js';
import { sendOperationalError, sendServerError } from '../utils/http.js';
import { findOrCreateCustomer, createCreditCardPayment, createPixPayment, mapAsaasStatus } from '../services/asaasService.js';

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

function normalizeDigits(value) {
  return value?.replace(/\D/g, '') ?? '';
}

export async function create(req, res) {
  const {
    reservation_id,
    billing_type = 'CREDIT_CARD',
    card_last4,
    card_number,
    card_holder_name,
    card_expiry,
    card_cvv,
    billing_cpf_cnpj,
    billing_phone,
    billing_postal_code,
    billing_address_number,
  } = req.body;

  if (!reservation_id) return res.status(400).json({ error: 'reservation_id é obrigatório.' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const resv = await client.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [reservation_id]);
    if (!resv.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reserva não encontrada.' });
    }
    const r = resv.rows[0];

    if (r.guest_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Sem permissão para pagar esta reserva.' });
    }

    if (r.status === 'approved' && new Date(r.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE reservations
            SET status = 'cancelled', expired_at = COALESCE(expired_at, NOW()), updated_date = NOW()
          WHERE id = $1`,
        [reservation_id]
      );
      await client.query('COMMIT');
      return res.status(409).json({
        error: 'O prazo de 30 minutos para pagamento expirou. Faça uma nova solicitação.',
      });
    }

    if (r.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Esta reserva ainda não está aprovada para pagamento.' });
    }

    const existing = await client.query('SELECT * FROM payments WHERE reservation_id = $1', [reservation_id]);
    if (existing.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Esta reserva já possui pagamento registrado.' });
    }

    const userResult = await client.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const guest = userResult.rows[0];
    const hostResult = await client.query(
      `SELECT
          COALESCE(owner.asaas_wallet_id, legacy.asaas_wallet_id) AS asaas_wallet_id,
          COALESCE(owner.email, legacy.email, $2) AS email
       FROM properties p
       LEFT JOIN users owner ON owner.id = p.created_by
       LEFT JOIN users legacy ON legacy.email = $2
       WHERE p.id = $1`,
      [r.property_id, r.host_email]
    );
    const hostWalletId = hostResult.rows[0]?.asaas_wallet_id;
    const hostEmail = hostResult.rows[0]?.email || r.host_email;
    if (!hostWalletId) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Anfitrião ainda não está habilitado para receber pagamentos.' });
    }

    const customer = await findOrCreateCustomer({
      name: guest.full_name,
      email: guest.email,
      cpf: normalizeDigits(billing_cpf_cnpj || guest.document_number),
      phone: normalizeDigits(billing_phone || guest.phone),
    });

    let paymentStatus = 'pending';
    let gatewayStatus = null;
    let gatewayPaymentId = null;
    let pixQrCode = null;
    let pixPayload = null;

    if (billing_type === 'CREDIT_CARD') {
      if (!card_number || !card_holder_name || !card_expiry || !card_cvv ||
          !billing_cpf_cnpj || !billing_phone || !billing_postal_code || !billing_address_number) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Dados do cartão incompletos. Informe cartão, CPF/CNPJ, telefone, CEP e número do endereço.'
        });
      }

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
        holderInfo: {
          name: card_holder_name,
          email: guest.email,
          cpfCnpj: normalizeDigits(billing_cpf_cnpj),
          phone: normalizeDigits(billing_phone),
          postalCode: normalizeDigits(billing_postal_code),
          addressNumber: billing_address_number,
        },
        remoteIp: req.ip,
        hostWalletId,
      });

      gatewayStatus = asaasPayment.status;
      gatewayPaymentId = asaasPayment.id;
      paymentStatus = mapAsaasStatus(asaasPayment.status);
    } else if (billing_type === 'PIX') {
      const asaasPix = await createPixPayment({
        customer,
        reservation: {
          id: r.id,
          totalPrice: Number(r.total_price),
          propertyName: r.property_title,
          description: r.property_title,
        },
        hostWalletId,
      });

      gatewayStatus = asaasPix.status;
      gatewayPaymentId = asaasPix.id;
      paymentStatus = mapAsaasStatus(asaasPix.status);
      pixQrCode = asaasPix.pix.encodedImage;
      pixPayload = asaasPix.pix.payload;
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Método de pagamento não suportado.' });
    }

    const insertResult = await client.query(
      `INSERT INTO payments
         (reservation_id, property_title, guest_email, host_email,
          total_amount, platform_fee, host_net, card_last4, status,
          billing_type, gateway_payment_id, gateway_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        reservation_id,
        r.property_title,
        r.guest_email,
        hostEmail,
        r.total_price,
        r.platform_fee,
        r.host_net,
        billing_type === 'CREDIT_CARD' ? (card_last4 ?? null) : null,
        paymentStatus,
        billing_type,
        gatewayPaymentId,
        gatewayStatus,
      ]
    );

    if (paymentStatus === 'paid') {
      await client.query(
        `UPDATE reservations SET status = 'confirmed', updated_date = NOW() WHERE id = $1`,
        [reservation_id]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      ...insertResult.rows[0],
      gateway_pix_qrcode: pixQrCode,
      gateway_pix_payload: pixPayload,
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (err.publicMessage) return sendOperationalError(res, err);
    sendServerError(res, err);
  } finally {
    client?.release();
  }
}
