import { pool } from '../db/pool.js';
import { sendServerError } from '../utils/http.js';

export async function listByProperty(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM reviews WHERE property_id = $1 ORDER BY created_date DESC',
      [req.params.propertyId]
    );
    res.json(result.rows);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function create(req, res) {
  const { property_id, rating, comment } = req.body;
  if (!property_id || !rating)
    return res.status(400).json({ error: 'property_id e rating são obrigatórios.' });

  try {
    const result = await pool.query(
      `INSERT INTO reviews (property_id, user_id, user_email, guest_name, rating, comment)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [property_id, req.user.id, req.user.email, req.user.full_name, rating, comment]
    );

    // Atualizar média e contagem na tabela properties
    await pool.query(
      `UPDATE properties SET
         rating = (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE property_id = $1),
         review_count = (SELECT COUNT(*) FROM reviews WHERE property_id = $1),
         updated_date = NOW()
       WHERE id = $1`,
      [property_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function remove(req, res) {
  try {
    const result = await pool.query(
      'DELETE FROM reviews WHERE id = $1 AND user_id = $2 RETURNING id, property_id',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Avaliação não encontrada ou sem permissão.' });

    await pool.query(
      `UPDATE properties SET
         rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE property_id = $1), 0),
         review_count = (SELECT COUNT(*) FROM reviews WHERE property_id = $1),
         updated_date = NOW()
       WHERE id = $1`,
      [result.rows[0].property_id]
    );

    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
}
