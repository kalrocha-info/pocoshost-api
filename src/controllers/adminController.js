import { pool } from '../db/pool.js';
import bcrypt from 'bcryptjs';
import { sendServerError } from '../utils/http.js';

// ============================================
// DASHBOARD - Métricas gerais
// ============================================

export async function getStats(req, res) {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'host') AS total_hosts,
        (SELECT COUNT(*) FROM users WHERE role = 'guest') AS total_guests,
        (SELECT COUNT(*) FROM properties) AS total_properties,
        (SELECT COUNT(*) FROM properties WHERE status = 'active') AS active_properties,
        (SELECT COUNT(*) FROM reservations) AS total_reservations,
        (SELECT COUNT(*) FROM reservations WHERE status = 'pending') AS pending_reservations,
        (SELECT COUNT(*) FROM reservations WHERE status = 'confirmed') AS confirmed_reservations,
        (SELECT COUNT(*) FROM reservations WHERE status = 'cancelled') AS cancelled_reservations,
        (SELECT COALESCE(SUM(total_price), 0) FROM reservations WHERE status IN ('confirmed', 'completed')) AS total_revenue,
        (SELECT COALESCE(SUM(platform_fee), 0) FROM reservations WHERE status IN ('confirmed', 'completed')) AS total_platform_fees
    `);

    // Reservas do mês atual
    const monthStats = await pool.query(`
      SELECT
        COUNT(*) AS month_reservations,
        COALESCE(SUM(total_price), 0) AS month_revenue
      FROM reservations
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
        AND status IN ('confirmed', 'completed', 'pending')
    `);

    // Atividades recentes (últimas 10)
    const recentActivity = await pool.query(`
      (
        SELECT 'reservation' AS type, r.id, r.created_at, 
               p.title AS property_title, u.full_name AS user_name, r.status
        FROM reservations r
        JOIN properties p ON r.property_id = p.id
        JOIN users u ON r.user_id = u.id
        ORDER BY r.created_at DESC
        LIMIT 5
      )
      UNION ALL
      (
        SELECT 'property' AS type, p.id, p.created_at,
               p.title AS property_title, u.full_name AS user_name, p.status
        FROM properties p
        JOIN users u ON p.owner_id = u.id
        ORDER BY p.created_at DESC
        LIMIT 5
      )
      ORDER BY created_at DESC
      LIMIT 10
    `);

    res.json({
      ...stats.rows[0],
      ...monthStats.rows[0],
      recent_activity: recentActivity.rows,
    });
  } catch (err) {
    sendServerError(res, err);
  }
}

// ============================================
// HOSTS - Gestão de anfitriões
// ============================================

export async function listHosts(req, res) {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT u.id, u.email, u.full_name, u.phone, u.role, u.created_at,
             COUNT(DISTINCT p.id) AS properties_count,
             COUNT(DISTINCT r.id) AS reservations_count,
             COALESCE(SUM(CASE WHEN r.status IN ('confirmed', 'completed') THEN r.total_price ELSE 0 END), 0) AS total_revenue
      FROM users u
      LEFT JOIN properties p ON p.owner_id = u.id
      LEFT JOIN reservations r ON r.property_id = p.id
      WHERE u.role = 'host'
    `;
    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (u.full_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Total count
    let countQuery = `SELECT COUNT(*) FROM users WHERE role = 'host'`;
    if (search) {
      countQuery += ` AND (full_name ILIKE $1 OR email ILIKE $1)`;
    }
    const countResult = await pool.query(countQuery, search ? [`%${search}%`] : []);

    res.json({
      hosts: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function getHost(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, email, full_name, phone, role, created_at FROM users WHERE id = $1 AND role = 'host'`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Anfitrião não encontrado.' });
    }

    // Buscar imóveis do anfitrião
    const properties = await pool.query(
      `SELECT id, title, city, price_per_night, status, created_at FROM properties WHERE owner_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    res.json({
      ...result.rows[0],
      properties: properties.rows,
    });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function createHost(req, res) {
  try {
    const { email, full_name, phone, password } = req.body;

    if (!email || !full_name || !password) {
      return res.status(400).json({ error: 'Email, nome e senha são obrigatórios.' });
    }

    // Verificar se email já existe
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email já cadastrado.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, full_name, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, 'host')
       RETURNING id, email, full_name, phone, role, created_at`,
      [email, full_name, phone || null, hashedPassword]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function updateHost(req, res) {
  try {
    const { id } = req.params;
    const { full_name, phone, password } = req.body;

    // Verificar se existe
    const existing = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [id, 'host']);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Anfitrião não encontrado.' });
    }

    let query = 'UPDATE users SET full_name = COALESCE($1, full_name), phone = COALESCE($2, phone)';
    const params = [full_name, phone];
    let paramIndex = 3;

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += `, password_hash = $${paramIndex}`;
      params.push(hashedPassword);
      paramIndex++;
    }

    query += ` WHERE id = $${paramIndex} RETURNING id, email, full_name, phone, role, created_at`;
    params.push(id);

    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function deleteHost(req, res) {
  try {
    const { id } = req.params;

    // Verificar se tem reservas ativas
    const activeReservations = await pool.query(
      `SELECT COUNT(*) FROM reservations r
       JOIN properties p ON r.property_id = p.id
       WHERE p.owner_id = $1 AND r.status IN ('pending', 'confirmed')`,
      [id]
    );

    if (parseInt(activeReservations.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Não é possível remover anfitrião com reservas ativas. Cancele as reservas primeiro.' 
      });
    }

    // Soft delete - apenas marca como inativo (podemos adicionar coluna status depois)
    // Por enquanto, vamos deletar de verdade
    await pool.query('DELETE FROM users WHERE id = $1 AND role = $2', [id, 'host']);

    res.status(204).send();
  } catch (err) {
    sendServerError(res, err);
  }
}

// ============================================
// PROPERTIES - Gestão de imóveis (admin)
// ============================================

export async function listAllProperties(req, res) {
  try {
    const { search, owner_id, category, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT p.*, u.full_name AS owner_name, u.email AS owner_email,
             c.name AS category_name,
             (SELECT COUNT(*) FROM reservations r WHERE r.property_id = p.id) AS reservations_count
      FROM properties p
      JOIN users u ON p.owner_id = u.id
      LEFT JOIN categories c ON p.category_slug = c.slug
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (p.title ILIKE $${paramIndex} OR p.city ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (owner_id) {
      query += ` AND p.owner_id = $${paramIndex}`;
      params.push(owner_id);
      paramIndex++;
    }

    if (category) {
      query += ` AND p.category_slug = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Total count
    let countQuery = 'SELECT COUNT(*) FROM properties WHERE 1=1';
    const countParams = [];
    let countIndex = 1;

    if (search) {
      countQuery += ` AND (title ILIKE $${countIndex} OR city ILIKE $${countIndex})`;
      countParams.push(`%${search}%`);
      countIndex++;
    }
    if (owner_id) {
      countQuery += ` AND owner_id = $${countIndex}`;
      countParams.push(owner_id);
      countIndex++;
    }
    if (category) {
      countQuery += ` AND category_slug = $${countIndex}`;
      countParams.push(category);
      countIndex++;
    }
    if (status) {
      countQuery += ` AND status = $${countIndex}`;
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      properties: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function createPropertyForHost(req, res) {
  try {
    const { owner_id, title, description, city, address, price_per_night, max_guests, bedrooms, bathrooms, category_slug, amenities, cover_photo, photos, status } = req.body;

    if (!owner_id || !title || !city || !price_per_night) {
      return res.status(400).json({ error: 'Anfitrião, título, cidade e preço são obrigatórios.' });
    }

    // Verificar se o owner existe e é host
    const owner = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [owner_id, 'host']);
    if (owner.rows.length === 0) {
      return res.status(404).json({ error: 'Anfitrião não encontrado.' });
    }

    const result = await pool.query(
      `INSERT INTO properties (owner_id, title, description, city, address, price_per_night, max_guests, bedrooms, bathrooms, category_slug, amenities, cover_photo, photos, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [owner_id, title, description || '', city, address || '', price_per_night, max_guests || 2, bedrooms || 1, bathrooms || 1, category_slug || null, amenities || [], cover_photo || null, photos || [], status || 'active']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function updatePropertyAdmin(req, res) {
  try {
    const { id } = req.params;
    const { title, description, city, address, price_per_night, max_guests, bedrooms, bathrooms, category_slug, amenities, cover_photo, photos, status } = req.body;

    const result = await pool.query(
      `UPDATE properties SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        city = COALESCE($3, city),
        address = COALESCE($4, address),
        price_per_night = COALESCE($5, price_per_night),
        max_guests = COALESCE($6, max_guests),
        bedrooms = COALESCE($7, bedrooms),
        bathrooms = COALESCE($8, bathrooms),
        category_slug = COALESCE($9, category_slug),
        amenities = COALESCE($10, amenities),
        cover_photo = COALESCE($11, cover_photo),
        photos = COALESCE($12, photos),
        status = COALESCE($13, status),
        updated_at = NOW()
       WHERE id = $14
       RETURNING *`,
      [title, description, city, address, price_per_night, max_guests, bedrooms, bathrooms, category_slug, amenities, cover_photo, photos, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Imóvel não encontrado.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function deletePropertyAdmin(req, res) {
  try {
    const { id } = req.params;

    // Verificar se tem reservas ativas
    const activeReservations = await pool.query(
      `SELECT COUNT(*) FROM reservations WHERE property_id = $1 AND status IN ('pending', 'confirmed')`,
      [id]
    );

    if (parseInt(activeReservations.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Não é possível remover imóvel com reservas ativas.' 
      });
    }

    await pool.query('DELETE FROM properties WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    sendServerError(res, err);
  }
}

// ============================================
// RESERVATIONS - Gestão de reservas (admin)
// ============================================

export async function listAllReservations(req, res) {
  try {
    const { status, property_id, host_id, guest_id, from_date, to_date, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT r.*, 
             p.title AS property_title, p.city AS property_city,
             host.full_name AS host_name, host.email AS host_email,
             guest.full_name AS guest_name, guest.email AS guest_email, guest.phone AS guest_phone
      FROM reservations r
      JOIN properties p ON r.property_id = p.id
      JOIN users host ON p.owner_id = host.id
      JOIN users guest ON r.user_id = guest.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND r.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (property_id) {
      query += ` AND r.property_id = $${paramIndex}`;
      params.push(property_id);
      paramIndex++;
    }

    if (host_id) {
      query += ` AND p.owner_id = $${paramIndex}`;
      params.push(host_id);
      paramIndex++;
    }

    if (guest_id) {
      query += ` AND r.user_id = $${paramIndex}`;
      params.push(guest_id);
      paramIndex++;
    }

    if (from_date) {
      query += ` AND r.check_in >= $${paramIndex}`;
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      query += ` AND r.check_out <= $${paramIndex}`;
      params.push(to_date);
      paramIndex++;
    }

    query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Total count (simplificado)
    const countResult = await pool.query('SELECT COUNT(*) FROM reservations');

    res.json({
      reservations: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function updateReservationAdmin(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const result = await pool.query(
      `UPDATE reservations SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reserva não encontrada.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

// ============================================
// PAYMENTS - Gestão de pagamentos (admin)
// ============================================

export async function listAllPayments(req, res) {
  try {
    const { status, host_id, from_date, to_date, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT pay.*, 
             r.check_in, r.check_out, r.total_price AS reservation_total,
             p.title AS property_title,
             host.full_name AS host_name, host.email AS host_email,
             guest.full_name AS guest_name
      FROM payments pay
      JOIN reservations r ON pay.reservation_id = r.id
      JOIN properties p ON r.property_id = p.id
      JOIN users host ON p.owner_id = host.id
      JOIN users guest ON r.user_id = guest.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND pay.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (host_id) {
      query += ` AND p.owner_id = $${paramIndex}`;
      params.push(host_id);
      paramIndex++;
    }

    if (from_date) {
      query += ` AND pay.created_at >= $${paramIndex}`;
      params.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      query += ` AND pay.created_at <= $${paramIndex}`;
      params.push(to_date);
      paramIndex++;
    }

    query += ` ORDER BY pay.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Total count
    const countResult = await pool.query('SELECT COUNT(*) FROM payments');

    res.json({
      payments: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function getPaymentStats(req, res) {
  try {
    const { from_date, to_date } = req.query;

    let dateFilter = '';
    const params = [];

    if (from_date && to_date) {
      dateFilter = 'WHERE pay.created_at BETWEEN $1 AND $2';
      params.push(from_date, to_date);
    }

    const stats = await pool.query(`
      SELECT
        COUNT(*) AS total_payments,
        COALESCE(SUM(CASE WHEN pay.status = 'paid' THEN pay.amount ELSE 0 END), 0) AS total_received,
        COALESCE(SUM(CASE WHEN pay.status = 'pending' THEN pay.amount ELSE 0 END), 0) AS total_pending,
        COALESCE(SUM(CASE WHEN pay.status = 'refunded' THEN pay.amount ELSE 0 END), 0) AS total_refunded
      FROM payments pay
      ${dateFilter}
    `, params);

    // Taxa da plataforma (15.5% do total recebido)
    const platformFee = parseFloat(stats.rows[0].total_received) * 0.155;

    res.json({
      ...stats.rows[0],
      platform_fee: platformFee.toFixed(2),
      host_net: (parseFloat(stats.rows[0].total_received) - platformFee).toFixed(2),
    });
  } catch (err) {
    sendServerError(res, err);
  }
}
