import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { sendServerError } from '../utils/http.js';

const VALID_ROLES = ['guest', 'host', 'admin'];
const VALID_RESERVATION_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'];

function parsePagination(query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  return { page, limit, offset: (page - 1) * limit };
}

function isSelf(req, id) {
  return String(req.user?.id) === String(id);
}

function propertyStatusToActive(status) {
  if (status === undefined || status === null || status === '') return undefined;
  return status === 'active';
}

function activeToStatus(isActive) {
  return isActive ? 'active' : 'inactive';
}

function compactUser(row) {
  if (!row) return row;
  const { document_number, ...safe } = row;
  return safe;
}

export async function getStats(req, res) {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'admin') AS total_admins,
        (SELECT COUNT(*) FROM users WHERE role = 'host') AS total_hosts,
        (SELECT COUNT(*) FROM users WHERE role = 'guest') AS total_guests,
        (SELECT COUNT(*) FROM properties) AS total_properties,
        (SELECT COUNT(*) FROM properties WHERE is_active = true) AS active_properties,
        (SELECT COUNT(*) FROM reservations) AS total_reservations,
        (SELECT COUNT(*) FROM reservations WHERE status = 'pending') AS pending_reservations,
        (SELECT COUNT(*) FROM reservations WHERE status = 'confirmed') AS confirmed_reservations,
        (SELECT COUNT(*) FROM reservations WHERE status = 'cancelled') AS cancelled_reservations,
        (SELECT COUNT(*) FROM reservations WHERE status = 'completed') AS completed_reservations,
        (SELECT COALESCE(SUM(total_price), 0) FROM reservations WHERE status IN ('confirmed', 'completed')) AS total_revenue,
        (SELECT COALESCE(SUM(platform_fee), 0) FROM reservations WHERE status IN ('confirmed', 'completed')) AS total_platform_fees,
        (SELECT COALESCE(SUM(host_net), 0) FROM reservations WHERE status IN ('confirmed', 'completed')) AS total_host_net
    `);

    const monthStats = await pool.query(`
      SELECT
        COUNT(*) AS month_reservations,
        COALESCE(SUM(total_price), 0) AS month_revenue
      FROM reservations
      WHERE created_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND status IN ('pending', 'confirmed', 'completed')
    `);

    const recentActivity = await pool.query(`
      (
        SELECT 'reservation' AS type, r.id, r.created_date,
               p.title AS property_title,
               COALESCE(r.guest_name, guest.full_name, r.guest_email) AS user_name,
               r.status
        FROM reservations r
        JOIN properties p ON r.property_id = p.id
        LEFT JOIN users guest ON r.guest_id = guest.id
        ORDER BY r.created_date DESC
        LIMIT 5
      )
      UNION ALL
      (
        SELECT 'property' AS type, p.id, p.created_date,
               p.title AS property_title,
               COALESCE(owner.full_name, p.host_name, p.host_email) AS user_name,
               CASE WHEN p.is_active THEN 'active' ELSE 'inactive' END AS status
        FROM properties p
        LEFT JOIN users owner ON p.created_by = owner.id
        ORDER BY p.created_date DESC
        LIMIT 5
      )
      ORDER BY created_date DESC
      LIMIT 10
    `);

    res.json({
      ...stats.rows[0],
      ...monthStats.rows[0],
      recent_activity: recentActivity.rows.map((row) => ({
        ...row,
        created_at: row.created_date,
      })),
    });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function listHosts(req, res) {
  try {
    const { search } = req.query;
    const { page, limit, offset } = parsePagination(req.query);
    const params = [];
    const filters = ["u.role = 'host'"];

    if (search) {
      params.push(`%${search}%`);
      filters.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }

    const where = filters.join(' AND ');
    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.asaas_wallet_id, u.created_date,
              COUNT(DISTINCT p.id) AS properties_count,
              COUNT(DISTINCT r.id) AS reservations_count,
              COALESCE(SUM(CASE WHEN r.status IN ('confirmed', 'completed') THEN r.total_price ELSE 0 END), 0) AS total_revenue
       FROM users u
       LEFT JOIN properties p ON p.created_by = u.id
       LEFT JOIN reservations r ON r.property_id = p.id
       WHERE ${where}
       GROUP BY u.id
       ORDER BY u.created_date DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const countResult = await pool.query(`SELECT COUNT(*) FROM users u WHERE ${where}`, params);

    res.json({ hosts: result.rows, total: Number(countResult.rows[0].count), page, limit });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function getHost(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, email, full_name, phone, role, document_type, company_name, address_info, asaas_wallet_id, created_date
       FROM users WHERE id = $1 AND role = 'host'`,
      [req.params.id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Anfitriao nao encontrado.' });

    const properties = await pool.query(
      `SELECT id, title, city, price_per_night,
              CASE WHEN is_active THEN 'active' ELSE 'inactive' END AS status,
              created_date
       FROM properties WHERE created_by = $1 ORDER BY created_date DESC`,
      [req.params.id]
    );

    res.json({ ...result.rows[0], properties: properties.rows });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function createHost(req, res) {
  try {
    const { email, full_name, phone, password, document_type, document_number, company_name, address_info, asaas_wallet_id } = req.body;
    if (!email || !full_name || !password) {
      return res.status(400).json({ error: 'Email, nome e senha sao obrigatorios.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users
        (email, full_name, phone, password_hash, role, document_type, document_number, company_name, address_info, asaas_wallet_id)
       VALUES ($1, $2, $3, $4, 'host', $5, $6, $7, $8, $9)
       RETURNING id, email, full_name, phone, role, document_type, company_name, asaas_wallet_id, created_date`,
      [email, full_name, phone || null, passwordHash, document_type || null, document_number || null, company_name || null, address_info || null, asaas_wallet_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email ja cadastrado.' });
    sendServerError(res, err);
  }
}

export async function updateHost(req, res) {
  try {
    const { full_name, phone, password, document_type, document_number, company_name, address_info, asaas_wallet_id } = req.body;
    const existing = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'host'", [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Anfitriao nao encontrado.' });

    const updates = [];
    const params = [];
    const fields = { full_name, phone, document_type, document_number, company_name, address_info,
      asaas_wallet_id: asaas_wallet_id === undefined ? undefined : (asaas_wallet_id || null) };
    for (const [field, value] of Object.entries(fields)) {
      if (value !== undefined) {
        params.push(value);
        updates.push(`${field} = $${params.length}`);
      }
    }
    if (password) {
      params.push(await bcrypt.hash(password, 10));
      updates.push(`password_hash = $${params.length}`);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')}, updated_date = NOW()
       WHERE id = $${params.length}
       RETURNING id, email, full_name, phone, role, document_type, company_name, asaas_wallet_id, created_date`,
      params
    );
    res.json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function deleteHost(req, res) {
  try {
    if (isSelf(req, req.params.id)) {
      return res.status(400).json({ error: 'Voce nao pode remover a propria conta.' });
    }

    const activeReservations = await pool.query(
      `SELECT COUNT(*) FROM reservations r
       JOIN properties p ON r.property_id = p.id
       WHERE p.created_by = $1 AND r.status IN ('pending', 'confirmed')`,
      [req.params.id]
    );

    if (Number(activeReservations.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Nao e possivel remover anfitriao com reservas ativas.' });
    }

    const result = await pool.query("DELETE FROM users WHERE id = $1 AND role = 'host' RETURNING id", [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Anfitriao nao encontrado.' });
    res.status(204).send();
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function listAllProperties(req, res) {
  try {
    const { search, owner_id, category, status } = req.query;
    const { page, limit, offset } = parsePagination(req.query);
    const params = [];
    const filters = ['1=1'];

    if (search) { params.push(`%${search}%`); filters.push(`(p.title ILIKE $${params.length} OR p.city ILIKE $${params.length})`); }
    if (owner_id) { params.push(owner_id); filters.push(`p.created_by = $${params.length}`); }
    if (category) { params.push(category); filters.push(`p.category = $${params.length}`); }
    const active = propertyStatusToActive(status);
    if (active !== undefined) { params.push(active); filters.push(`p.is_active = $${params.length}`); }

    const where = filters.join(' AND ');
    const result = await pool.query(
      `SELECT p.*, p.created_by AS owner_id, p.category AS category_slug,
              CASE WHEN p.is_active THEN 'active' ELSE 'inactive' END AS status,
              p.created_date AS created_at,
              owner.full_name AS owner_name, owner.email AS owner_email,
              c.name AS category_name,
              (SELECT COUNT(*) FROM reservations r WHERE r.property_id = p.id) AS reservations_count
       FROM properties p
       LEFT JOIN users owner ON p.created_by = owner.id
       LEFT JOIN property_categories c ON p.category = c.slug
       WHERE ${where}
       ORDER BY p.created_date DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const countResult = await pool.query(`SELECT COUNT(*) FROM properties p WHERE ${where}`, params);
    res.json({ properties: result.rows, total: Number(countResult.rows[0].count), page, limit });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function createPropertyForHost(req, res) {
  try {
    const {
      owner_id, title, description, city, state, address, price_per_night, max_guests,
      bedrooms, bathrooms, category_slug, amenities, cover_photo, photos, status,
    } = req.body;

    if (!owner_id || !title || !city || !price_per_night) {
      return res.status(400).json({ error: 'Anfitriao, titulo, cidade e preco sao obrigatorios.' });
    }

    const owner = await pool.query("SELECT id, email, full_name FROM users WHERE id = $1 AND role = 'host'", [owner_id]);
    if (!owner.rows[0]) return res.status(404).json({ error: 'Anfitriao nao encontrado.' });

    const result = await pool.query(
      `INSERT INTO properties
        (created_by, title, description, city, state, address, price_per_night, max_guests,
         bedrooms, bathrooms, category, tags, cover_photo, photos, is_active, host_name, host_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *, created_by AS owner_id, category AS category_slug,
         CASE WHEN is_active THEN 'active' ELSE 'inactive' END AS status`,
      [
        owner_id, title, description || '', city, state || null, address || '',
        price_per_night, max_guests || 2, bedrooms || 1, bathrooms || 1,
        category_slug || null, amenities || [], cover_photo || null, photos || [],
        propertyStatusToActive(status ?? 'active'), owner.rows[0].full_name, owner.rows[0].email,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function updatePropertyAdmin(req, res) {
  try {
    const fieldMap = [
      ['title', 'title'], ['description', 'description'], ['city', 'city'], ['state', 'state'],
      ['address', 'address'], ['price_per_night', 'price_per_night'], ['max_guests', 'max_guests'],
      ['bedrooms', 'bedrooms'], ['bathrooms', 'bathrooms'], ['category_slug', 'category'],
      ['amenities', 'tags'], ['cover_photo', 'cover_photo'], ['photos', 'photos'],
    ];
    const updates = [];
    const params = [];
    for (const [inputKey, dbKey] of fieldMap) {
      if (req.body[inputKey] !== undefined) {
        params.push(req.body[inputKey]);
        updates.push(`${dbKey} = $${params.length}`);
      }
    }
    const active = propertyStatusToActive(req.body.status);
    if (active !== undefined) {
      params.push(active);
      updates.push(`is_active = $${params.length}`);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE properties SET ${updates.join(', ')}, updated_date = NOW()
       WHERE id = $${params.length}
       RETURNING *, created_by AS owner_id, category AS category_slug,
         CASE WHEN is_active THEN 'active' ELSE 'inactive' END AS status`,
      params
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Imovel nao encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function deletePropertyAdmin(req, res) {
  try {
    const activeReservations = await pool.query(
      "SELECT COUNT(*) FROM reservations WHERE property_id = $1 AND status IN ('pending', 'confirmed')",
      [req.params.id]
    );
    if (Number(activeReservations.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Nao e possivel remover imovel com reservas ativas.' });
    }

    const result = await pool.query('DELETE FROM properties WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Imovel nao encontrado.' });
    res.status(204).send();
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function listAllReservations(req, res) {
  try {
    const { status, property_id, host_id, guest_id, from_date, to_date } = req.query;
    const { page, limit, offset } = parsePagination(req.query);
    const params = [];
    const filters = ['1=1'];

    if (status) { params.push(status); filters.push(`r.status = $${params.length}`); }
    if (property_id) { params.push(property_id); filters.push(`r.property_id = $${params.length}`); }
    if (host_id) { params.push(host_id); filters.push(`p.created_by = $${params.length}`); }
    if (guest_id) { params.push(guest_id); filters.push(`r.guest_id = $${params.length}`); }
    if (from_date) { params.push(from_date); filters.push(`r.check_in >= $${params.length}`); }
    if (to_date) { params.push(to_date); filters.push(`r.check_out <= $${params.length}`); }

    const where = filters.join(' AND ');
    const result = await pool.query(
      `SELECT r.*, r.created_date AS created_at,
              p.title AS property_title, p.city AS property_city,
              host.full_name AS host_name, COALESCE(p.host_email, host.email) AS host_email,
              COALESCE(r.guest_name, guest.full_name) AS guest_name,
              COALESCE(r.guest_email, guest.email) AS guest_email,
              guest.phone AS guest_phone
       FROM reservations r
       JOIN properties p ON r.property_id = p.id
       LEFT JOIN users host ON p.created_by = host.id
       LEFT JOIN users guest ON r.guest_id = guest.id
       WHERE ${where}
       ORDER BY r.created_date DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM reservations r JOIN properties p ON r.property_id = p.id WHERE ${where}`,
      params
    );
    res.json({ reservations: result.rows, total: Number(countResult.rows[0].count), page, limit });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function updateReservationAdmin(req, res) {
  try {
    const { status } = req.body;
    if (!VALID_RESERVATION_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Status invalido.' });
    }

    const result = await pool.query(
      'UPDATE reservations SET status = $1, updated_date = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Reserva nao encontrada.' });
    res.json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function listAllPayments(req, res) {
  try {
    const { status, host_id, from_date, to_date } = req.query;
    const { page, limit, offset } = parsePagination(req.query);
    const params = [];
    const filters = ['1=1'];

    if (status) { params.push(status); filters.push(`pay.status = $${params.length}`); }
    if (host_id) { params.push(host_id); filters.push(`p.created_by = $${params.length}`); }
    if (from_date) { params.push(from_date); filters.push(`pay.created_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); filters.push(`pay.created_date <= $${params.length}`); }

    const where = filters.join(' AND ');
    const result = await pool.query(
      `SELECT pay.*, pay.total_amount AS amount, pay.created_date AS created_at,
              r.check_in, r.check_out, r.total_price AS reservation_total,
              p.title AS property_title,
              host.full_name AS host_name, COALESCE(pay.host_email, host.email) AS host_email,
              COALESCE(pay.guest_email, guest.email) AS guest_email,
              COALESCE(r.guest_name, guest.full_name) AS guest_name
       FROM payments pay
       JOIN reservations r ON pay.reservation_id = r.id
       JOIN properties p ON r.property_id = p.id
       LEFT JOIN users host ON p.created_by = host.id
       LEFT JOIN users guest ON r.guest_id = guest.id
       WHERE ${where}
       ORDER BY pay.created_date DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM payments pay
       JOIN reservations r ON pay.reservation_id = r.id
       JOIN properties p ON r.property_id = p.id
       WHERE ${where}`,
      params
    );
    res.json({ payments: result.rows, total: Number(countResult.rows[0].count), page, limit });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function getPaymentStats(req, res) {
  try {
    const { from_date, to_date } = req.query;
    const params = [];
    const filters = ['1=1'];
    if (from_date) { params.push(from_date); filters.push(`created_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); filters.push(`created_date <= $${params.length}`); }

    const stats = await pool.query(
      `SELECT
         COUNT(*) AS total_payments,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) AS total_received,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN total_amount ELSE 0 END), 0) AS total_pending,
         COALESCE(SUM(CASE WHEN status = 'refunded' THEN total_amount ELSE 0 END), 0) AS total_refunded,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN platform_fee ELSE 0 END), 0) AS platform_fee,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN host_net ELSE 0 END), 0) AS host_net
       FROM payments WHERE ${filters.join(' AND ')}`,
      params
    );
    res.json(stats.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function listUsers(req, res) {
  try {
    const { search, role } = req.query;
    const { page, limit, offset } = parsePagination(req.query);
    const params = [];
    const filters = ['1=1'];

    if (search) { params.push(`%${search}%`); filters.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length})`); }
    if (role) { params.push(role); filters.push(`role = $${params.length}`); }

    const where = filters.join(' AND ');
    const result = await pool.query(
      `SELECT id, email, full_name, phone, role, document_type, company_name, created_date
       FROM users WHERE ${where}
       ORDER BY created_date DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const countResult = await pool.query(`SELECT COUNT(*) FROM users WHERE ${where}`, params);
    res.json({ users: result.rows, total: Number(countResult.rows[0].count), page, limit });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function getUser(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, email, full_name, phone, role, document_type, document_number,
              company_name, address_info, created_date
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuario nao encontrado.' });
    res.json(compactUser(result.rows[0]));
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function createUser(req, res) {
  try {
    const { email, full_name, phone, password, role, document_type, document_number, company_name, address_info } = req.body;
    if (!email || !full_name || !password) {
      return res.status(400).json({ error: 'Email, nome e senha sao obrigatorios.' });
    }
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Perfil invalido. Use: guest, host ou admin.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users
        (email, full_name, phone, password_hash, role, document_type, document_number, company_name, address_info)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, email, full_name, phone, role, document_type, company_name, created_date`,
      [email, full_name, phone || null, passwordHash, role || 'guest', document_type || null, document_number || null, company_name || null, address_info || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email ja cadastrado.' });
    sendServerError(res, err);
  }
}

export async function updateUser(req, res) {
  try {
    const { full_name, phone, email, password, role, document_type, document_number, company_name, address_info } = req.body;
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Perfil invalido. Use: guest, host ou admin.' });
    }
    if (isSelf(req, req.params.id) && role && role !== 'admin') {
      return res.status(400).json({ error: 'Voce nao pode remover o proprio perfil administrativo.' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Usuario nao encontrado.' });

    const updates = [];
    const params = [];
    const fields = { full_name, phone, email, role, document_type, document_number, company_name, address_info };
    for (const [field, value] of Object.entries(fields)) {
      if (value !== undefined) {
        params.push(value);
        updates.push(`${field} = $${params.length}`);
      }
    }
    if (password) {
      params.push(await bcrypt.hash(password, 10));
      updates.push(`password_hash = $${params.length}`);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')}, updated_date = NOW()
       WHERE id = $${params.length}
       RETURNING id, email, full_name, phone, role, document_type, company_name, created_date`,
      params
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Este email ja esta em uso.' });
    sendServerError(res, err);
  }
}

export async function deleteUser(req, res) {
  try {
    if (isSelf(req, req.params.id)) {
      return res.status(400).json({ error: 'Voce nao pode deletar sua propria conta.' });
    }

    const activeReservations = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM reservations WHERE guest_id = $1 AND status IN ('pending', 'confirmed')) +
        (SELECT COUNT(*) FROM reservations r JOIN properties p ON r.property_id = p.id
          WHERE p.created_by = $1 AND r.status IN ('pending', 'confirmed')) AS count`,
      [req.params.id]
    );

    if (Number(activeReservations.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Nao e possivel remover usuario com reservas ativas.' });
    }

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuario nao encontrado.' });
    res.status(204).send();
  } catch (err) {
    sendServerError(res, err);
  }
}
