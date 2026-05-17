import { pool } from '../db/pool.js';
import { sendServerError } from '../utils/http.js';

export async function list(req, res) {
  try {
    const result = await pool.query(
      `SELECT f.id, f.property_id, f.created_date, p.title, p.city, p.cover_photo,
              p.price_per_night, p.rating, p.category
       FROM favorites f
       JOIN properties p ON p.id = f.property_id
       WHERE f.user_id = $1 ORDER BY f.created_date DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function toggle(req, res) {
  const { property_id } = req.body;
  if (!property_id) return res.status(400).json({ error: 'property_id é obrigatório.' });

  try {
    const existing = await pool.query(
      'SELECT id FROM favorites WHERE property_id = $1 AND user_id = $2',
      [property_id, req.user.id]
    );

    if (existing.rows[0]) {
      await pool.query('DELETE FROM favorites WHERE id = $1', [existing.rows[0].id]);
      return res.json({ favorited: false });
    }

    await pool.query(
      'INSERT INTO favorites (property_id, user_id, user_email) VALUES ($1,$2,$3)',
      [property_id, req.user.id, req.user.email]
    );
    res.json({ favorited: true });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function check(req, res) {
  try {
    const result = await pool.query(
      'SELECT id FROM favorites WHERE property_id = $1 AND user_id = $2',
      [req.params.propertyId, req.user.id]
    );
    res.json({ favorited: !!result.rows[0] });
  } catch (err) {
    sendServerError(res, err);
  }
}
