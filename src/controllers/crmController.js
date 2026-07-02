import { pool } from '../db/pool.js';
import { assertUUID, sendServerError } from '../utils/http.js';

const CONTACT_SELECT = `
  SELECT
    c.*,
    assigned.full_name AS assigned_name,
    COALESCE(activity_stats.activity_count, 0)::int AS activity_count,
    activity_stats.last_activity_at,
    COALESCE(user_stats.reservations_count, 0)::int AS reservations_count,
    COALESCE(user_stats.properties_count, 0)::int AS properties_count
  FROM crm_contacts c
  LEFT JOIN users assigned ON assigned.id = c.assigned_to
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS activity_count,
      MAX(created_date) AS last_activity_at
    FROM crm_activities
    WHERE contact_id = c.id
  ) activity_stats ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      (SELECT COUNT(*) FROM reservations WHERE guest_id = c.user_id) AS reservations_count,
      (SELECT COUNT(*) FROM properties WHERE created_by = c.user_id) AS properties_count
  ) user_stats ON c.user_id IS NOT NULL
`;

export async function listContacts(req, res) {
  try {
    const { search, stage, contact_type: contactType } = req.query;
    const filters = [];
    const params = [];

    if (search) {
      params.push(`%${search.trim()}%`);
      filters.push(
        `(c.full_name ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.phone ILIKE $${params.length})`
      );
    }
    if (stage) {
      params.push(stage);
      filters.push(`c.stage = $${params.length}`);
    }
    if (contactType) {
      params.push(contactType);
      filters.push(`c.contact_type = $${params.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const contacts = await pool.query(
      `${CONTACT_SELECT}
       ${where}
       ORDER BY
         CASE WHEN c.next_action_at IS NULL THEN 1 ELSE 0 END,
         c.next_action_at,
         c.updated_date DESC
       LIMIT 200`,
      params
    );
    const stats = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE stage = 'lead')::int AS leads,
        COUNT(*) FILTER (WHERE stage = 'contacted')::int AS contacted,
        COUNT(*) FILTER (WHERE stage = 'qualified')::int AS qualified,
        COUNT(*) FILTER (WHERE stage = 'onboarding')::int AS onboarding,
        COUNT(*) FILTER (WHERE stage = 'active')::int AS active,
        COUNT(*) FILTER (WHERE stage = 'inactive')::int AS inactive,
        COUNT(*) FILTER (
          WHERE next_action_at < NOW() AND stage <> 'inactive'
        )::int AS overdue,
        COUNT(*) FILTER (
          WHERE next_action_at >= CURRENT_DATE
            AND next_action_at < CURRENT_DATE + INTERVAL '1 day'
            AND stage <> 'inactive'
        )::int AS due_today
      FROM crm_contacts
    `);

    return res.json({ contacts: contacts.rows, stats: stats.rows[0] });
  } catch (err) {
    return sendServerError(res, err);
  }
}

export async function getContact(req, res) {
  if (!assertUUID(res, req.params.id)) return;

  try {
    const contact = await pool.query(
      `${CONTACT_SELECT} WHERE c.id = $1`,
      [req.params.id]
    );
    if (!contact.rows[0]) {
      return res.status(404).json({ error: 'Contacto não encontrado.' });
    }

    const activities = await pool.query(
      `SELECT
         a.*,
         author.full_name AS author_name
       FROM crm_activities a
       LEFT JOIN users author ON author.id = a.author_id
       WHERE a.contact_id = $1
       ORDER BY a.created_date DESC`,
      [req.params.id]
    );

    return res.json({ ...contact.rows[0], activities: activities.rows });
  } catch (err) {
    return sendServerError(res, err);
  }
}

export async function createContact(req, res) {
  try {
    const {
      user_id: userId,
      full_name: fullName,
      email,
      phone,
      contact_type: contactType,
      stage,
      source,
      summary,
      assigned_to: assignedTo,
      next_action_at: nextActionAt,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO crm_contacts (
         user_id, full_name, email, phone, contact_type, stage, source,
         summary, assigned_to, next_action_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        userId ?? null,
        fullName,
        email ?? null,
        phone ?? null,
        contactType,
        stage,
        source ?? null,
        summary ?? null,
        assignedTo ?? req.user.id,
        nextActionAt ?? null,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.constraint === 'crm_contacts_user_id_key') {
      return res.status(409).json({ error: 'Este utilizador já possui contacto no CRM.' });
    }
    return sendServerError(res, err);
  }
}

export async function updateContact(req, res) {
  if (!assertUUID(res, req.params.id)) return;

  try {
    const fields = {
      full_name: req.body.full_name,
      email: req.body.email,
      phone: req.body.phone,
      contact_type: req.body.contact_type,
      stage: req.body.stage,
      source: req.body.source,
      summary: req.body.summary,
      assigned_to: req.body.assigned_to,
      next_action_at: req.body.next_action_at,
    };
    const updates = [];
    const params = [];

    for (const [field, value] of Object.entries(fields)) {
      if (value !== undefined) {
        params.push(value);
        updates.push(`${field} = $${params.length}`);
      }
    }

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE crm_contacts
       SET ${updates.join(', ')}, updated_date = NOW()
       WHERE id = $${params.length}
       RETURNING *`,
      params
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Contacto não encontrado.' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    return sendServerError(res, err);
  }
}

export async function deleteContact(req, res) {
  if (!assertUUID(res, req.params.id)) return;

  try {
    const result = await pool.query(
      'DELETE FROM crm_contacts WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Contacto não encontrado.' });
    }

    return res.status(204).send();
  } catch (err) {
    return sendServerError(res, err);
  }
}

export async function createActivity(req, res) {
  if (!assertUUID(res, req.params.id)) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const contact = await client.query(
      'SELECT id FROM crm_contacts WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (!contact.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Contacto não encontrado.' });
    }

    const { activity_type: activityType, content, due_at: dueAt } = req.body;
    const activity = await client.query(
      `INSERT INTO crm_activities (
         contact_id, author_id, activity_type, content, due_at
       )
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [req.params.id, req.user.id, activityType, content, dueAt ?? null]
    );
    const updates = activityType === 'task'
      ? 'updated_date = NOW()'
      : 'last_contact_at = NOW(), updated_date = NOW()';
    await client.query(
      `UPDATE crm_contacts SET ${updates} WHERE id = $1`,
      [req.params.id]
    );
    await client.query('COMMIT');

    return res.status(201).json(activity.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return sendServerError(res, err);
  } finally {
    client.release();
  }
}

export async function updateActivity(req, res) {
  if (!assertUUID(res, req.params.activityId, 'activityId')) return;

  try {
    const { completed } = req.body;
    const result = await pool.query(
      `UPDATE crm_activities
       SET completed_at = CASE WHEN $1 THEN COALESCE(completed_at, NOW()) ELSE NULL END,
           updated_date = NOW()
       WHERE id = $2
       RETURNING *`,
      [completed, req.params.activityId]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Atividade não encontrada.' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    return sendServerError(res, err);
  }
}
