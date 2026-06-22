import { pool } from '../db/pool.js';
import { sendServerError } from '../utils/http.js';
import {
  activeReservationStatusSql,
  expirePendingReservations,
  RESERVATION_HOLD_MINUTES,
} from '../services/reservationExpirationService.js';

const PLATFORM_FEE_RATE = 0.155;

export async function list(req, res) {
  const { status } = req.query;
  const isHost = req.query.role === 'host';

  const conditions = [];
  const params = [];

  if (isHost) {
    params.push(req.user.email);
    conditions.push(`r.host_email = $${params.length}`);
  } else {
    params.push(req.user.id);
    conditions.push(`r.guest_id = $${params.length}`);
  }

  if (status) { params.push(status); conditions.push(`r.status = $${params.length}`); }

  try {
    await expirePendingReservations();
    conditions.push('r.expired_at IS NULL');
    const result = await pool.query(
      `SELECT r.*, p.cover_photo, p.city FROM reservations r
       LEFT JOIN properties p ON p.id = r.property_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.created_date DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function getById(req, res) {
  try {
    await expirePendingReservations();
    const result = await pool.query(
      `SELECT * FROM reservations
       WHERE id = $1 AND expired_at IS NULL AND (guest_id = $2 OR host_email = $3)`,
      [req.params.id, req.user.id, req.user.email]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Reserva não encontrada.' });
    res.json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function checkAvailability(req, res) {
  const { property_id, check_in, check_out } = req.query;
  if (!property_id || !check_in || !check_out)
    return res.status(400).json({ error: 'property_id, check_in e check_out são obrigatórios.' });
  try {
    const conflict = await pool.query(
      `SELECT id FROM reservations
       WHERE property_id = $1 AND ${activeReservationStatusSql('reservations')}
       AND check_in < $3 AND check_out > $2`,
      [property_id, check_in, check_out]
    );
    res.json({ available: conflict.rows.length === 0 });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function create(req, res) {
  const { property_id, check_in, check_out, guests } = req.body;
  if (!property_id || !check_in || !check_out || !guests)
    return res.status(400).json({ error: 'property_id, check_in, check_out e guests são obrigatórios.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock da linha do imóvel para serializar as tentativas de reserva concorrentes
    const prop = await client.query('SELECT * FROM properties WHERE id = $1 FOR UPDATE', [property_id]);
    if (!prop.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Imóvel não encontrado.' });
    }

    const property = prop.rows[0];

    // 2. Verificar conflito de datas na reserva
    const conflict = await client.query(
      `SELECT id FROM reservations
       WHERE property_id = $1 AND ${activeReservationStatusSql('reservations')}
       AND check_in < $3 AND check_out > $2`,
      [property_id, check_in, check_out]
    );
    if (conflict.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Imóvel indisponível para as datas selecionadas.' });
    }

    const nights = Math.ceil((new Date(check_out) - new Date(check_in)) / 86400000);
    const total_price = nights * Number(property.price_per_night);
    const platform_fee = +(total_price * PLATFORM_FEE_RATE).toFixed(2);
    const host_net = +(total_price - platform_fee).toFixed(2);

    const result = await client.query(
      `INSERT INTO reservations
         (property_id, property_title, guest_id, guest_email, guest_name,
          host_email, check_in, check_out, guests, total_price, platform_fee, host_net, status, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending', NOW() + ($13 * INTERVAL '1 minute'))
       RETURNING *`,
      [property_id, property.title, req.user.id, req.user.email, req.user.full_name,
       property.host_email, check_in, check_out, guests, total_price, platform_fee, host_net,
       RESERVATION_HOLD_MINUTES]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    sendServerError(res, err);
  } finally {
    client.release();
  }
}

export async function updateStatus(req, res) {
  const { status } = req.body;
  const allowed = ['confirmed', 'cancelled', 'completed'];
  if (!allowed.includes(status))
    return res.status(400).json({ error: `Status deve ser: ${allowed.join(', ')}` });

  try {
    const current = await pool.query('SELECT * FROM reservations WHERE id = $1', [req.params.id]);
    const reservation = current.rows[0];
    if (!reservation) return res.status(404).json({ error: 'Reserva não encontrada.' });

    const isHost = reservation.host_email === req.user.email;
    const isGuest = reservation.guest_id === req.user.id;
    const hostStatuses = ['confirmed', 'cancelled', 'completed'];
    const guestStatuses = ['cancelled'];
    const canUpdate = (isHost && hostStatuses.includes(status)) || (isGuest && guestStatuses.includes(status));

    if (!canUpdate) {
      return res.status(403).json({ error: 'Sem permissão para atualizar esta reserva.' });
    }

    const result = await pool.query(
      `UPDATE reservations SET status = $1, updated_date = NOW()
       WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Reserva não encontrada.' });
    res.json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}
