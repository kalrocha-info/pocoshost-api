import { pool } from '../db/pool.js';
import { sendServerError } from '../utils/http.js';

export async function list(req, res) {
  const { category, city, guests, sort = '-created_date', owner } = req.query;
  const conditions = ['p.is_active = true'];
  const params = [];

  // Filtro para listar apenas imóveis do anfitrião autenticado
  if (owner === 'me' && req.user?.id) {
    params.push(req.user.id);
    conditions.push(`p.created_by = $${params.length}`);
  }

  if (category) { params.push(category); conditions.push(`p.category = $${params.length}`); }
  if (city) { params.push(`%${city}%`); conditions.push(`p.city ILIKE $${params.length}`); }
  if (guests) { params.push(Number(guests)); conditions.push(`p.max_guests >= $${params.length}`); }

  const orderCol = sort.startsWith('-') ? sort.slice(1) : sort;
  const orderDir = sort.startsWith('-') ? 'DESC' : 'ASC';
  const safeOrder = ['created_date','price_per_night','rating','title'].includes(orderCol)
    ? orderCol : 'created_date';

  try {
    const result = await pool.query(
      `SELECT * FROM properties p WHERE ${conditions.join(' AND ')}
       ORDER BY p.${safeOrder} ${orderDir}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function getById(req, res) {
  try {
    const result = await pool.query('SELECT * FROM properties WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Imóvel não encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function create(req, res) {
  const {
    title, description, city, state, address, latitude, longitude,
    category, tags, price_per_night, max_guests, bedrooms, bathrooms,
    photos, cover_photo, rules, host_name,
  } = req.body;

  if (!title || !city || !category || !price_per_night)
    return res.status(400).json({ error: 'title, city, category e price_per_night são obrigatórios.' });

  try {
    const result = await pool.query(
      `INSERT INTO properties
         (title, description, city, state, address, latitude, longitude, category, tags,
          price_per_night, max_guests, bedrooms, bathrooms, photos, cover_photo, rules,
          host_name, host_email, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [title, description, city, state, address, latitude, longitude,
       category, tags ?? [], price_per_night, max_guests, bedrooms, bathrooms,
       photos ?? [], cover_photo, rules, host_name,
       req.user.email, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function update(req, res) {
  const fields = ['title','description','city','state','address','latitude','longitude',
    'category','tags','price_per_night','max_guests','bedrooms','bathrooms',
    'photos','cover_photo','rules','host_name','is_active'];

  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      params.push(req.body[f]);
      updates.push(`${f} = $${params.length}`);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

  params.push(req.params.id);
  params.push(req.user.id);

  try {
    const result = await pool.query(
      `UPDATE properties SET ${updates.join(', ')}, updated_date = NOW()
       WHERE id = $${params.length - 1} AND created_by = $${params.length}
       RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Imóvel não encontrado ou sem permissão.' });
    res.json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function remove(req, res) {
  try {
    const result = await pool.query(
      'DELETE FROM properties WHERE id = $1 AND created_by = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Imóvel não encontrado ou sem permissão.' });
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
}
