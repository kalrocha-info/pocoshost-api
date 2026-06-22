import { pool } from '../db/pool.js';
import { sendServerError } from '../utils/http.js';

export async function list(req, res) {
  try {
    const result = await pool.query('SELECT * FROM property_categories ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function create(req, res) {
  const { name, slug, description } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'name e slug são obrigatórios.' });

  try {
    const result = await pool.query(
      `INSERT INTO property_categories (name, slug, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [name, slug, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Slug já existe.' });
    sendServerError(res, err);
  }
}

export async function remove(req, res) {
  try {
    const result = await pool.query(
      'DELETE FROM property_categories WHERE slug = $1 RETURNING slug',
      [req.params.slug]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Categoria não encontrada.' });
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
}
