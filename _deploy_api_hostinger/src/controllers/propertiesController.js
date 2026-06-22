import { pool } from '../db/pool.js';
import { sendServerError, assertUUID } from '../utils/http.js';

const publicPropertyFields = [
  'id',
  'title',
  'description',
  'city',
  'state',
  'category',
  'tags',
  'price_per_night',
  'max_guests',
  'bedrooms',
  'bathrooms',
  'photos',
  'cover_photo',
  'rules',
  'rating',
  'review_count',
  'host_name',
];

const ownerPropertyFields = [
  ...publicPropertyFields,
  'address',
  'latitude',
  'longitude',
  'is_active',
  'created_date',
  'updated_date',
];

function roundCoordinate(value) {
  if (value === null || value === undefined) return value;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(2));
}

function toPublicProperty(row) {
  const property = Object.fromEntries(
    publicPropertyFields.map((field) => [field, row[field]])
  );

  if (row.latitude !== null && row.latitude !== undefined) {
    property.latitude = roundCoordinate(row.latitude);
  }
  if (row.longitude !== null && row.longitude !== undefined) {
    property.longitude = roundCoordinate(row.longitude);
  }

  return property;
}

function toOwnerProperty(row) {
  return Object.fromEntries(
    ownerPropertyFields.map((field) => [field, row[field]])
  );
}

export async function list(req, res) {
  const {
    category,
    city,
    guests,
    min_price,
    max_price,
    check_in,
    check_out,
    sort = '-created_date',
    owner,
  } = req.query;
  const conditions = ['p.is_active = true'];
  const params = [];

  if ((check_in && !check_out) || (!check_in && check_out)) {
    return res.status(400).json({ error: 'check_in e check_out devem ser informados juntos.' });
  }

  if (check_in && check_out && new Date(check_in) >= new Date(check_out)) {
    return res.status(400).json({ error: 'check_out deve ser posterior ao check_in.' });
  }

  if (owner === 'me' && !req.user?.id) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  // Filtro para listar apenas imóveis do anfitrião autenticado
  if (owner === 'me' && req.user?.id) {
    params.push(req.user.id);
    conditions.push(`p.created_by = $${params.length}`);
  } else {
    conditions.push(`COALESCE(owner.account_status, 'active') <> 'blocked'`);
  }

  if (category) { params.push(category); conditions.push(`p.category = $${params.length}`); }
  if (city) { params.push(`%${city}%`); conditions.push(`p.city ILIKE $${params.length}`); }
  if (guests) { params.push(Number(guests)); conditions.push(`p.max_guests >= $${params.length}`); }
  if (min_price) { params.push(Number(min_price)); conditions.push(`p.price_per_night >= $${params.length}`); }
  if (max_price) { params.push(Number(max_price)); conditions.push(`p.price_per_night <= $${params.length}`); }
  if (check_in && check_out) {
    params.push(check_in, check_out);
    const checkInParam = params.length - 1;
    const checkOutParam = params.length;
    conditions.push(
      `NOT EXISTS (
        SELECT 1 FROM reservations r
        WHERE r.property_id = p.id
          AND (r.status = 'confirmed' OR (r.status IN ('pending', 'approved') AND r.expires_at > NOW()))
          AND r.check_in < $${checkOutParam}
          AND r.check_out > $${checkInParam}
      )`
    );
  }
  const orderCol = sort.startsWith('-') ? sort.slice(1) : sort;
  const orderDir = sort.startsWith('-') ? 'DESC' : 'ASC';
  const safeOrder = ['created_date','price_per_night','rating','title'].includes(orderCol)
    ? orderCol : 'created_date';

  try {
    const result = await pool.query(
      `SELECT p.* FROM properties p
       LEFT JOIN users owner ON owner.id = p.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.${safeOrder} ${orderDir}`,
      params
    );
    const serializer = owner === 'me' ? toOwnerProperty : toPublicProperty;
    res.json(result.rows.map(serializer));
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function getById(req, res) {
  if (!assertUUID(res, req.params.id)) return;
  try {
    const result = await pool.query(
      `SELECT p.* FROM properties p
       LEFT JOIN users owner ON owner.id = p.created_by
       WHERE p.id = $1
         AND p.is_active = TRUE
         AND COALESCE(owner.account_status, 'active') <> 'blocked'`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Imóvel não encontrado.' });
    res.json(toPublicProperty(result.rows[0]));
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
    if (req.user.account_status === 'blocked') {
      return res.status(403).json({ error: 'Conta bloqueada.' });
    }
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
  if (!assertUUID(res, req.params.id)) return;
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
    if (req.user.account_status === 'blocked') {
      return res.status(403).json({ error: 'Conta bloqueada.' });
    }
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
  if (!assertUUID(res, req.params.id)) return;
  try {
    if (req.user.account_status === 'blocked') {
      return res.status(403).json({ error: 'Conta bloqueada.' });
    }
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
