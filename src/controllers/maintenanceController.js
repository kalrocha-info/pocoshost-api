import { pool } from '../db/pool.js'
import { assertUUID, sendServerError } from '../utils/http.js'

const ORDER_SELECT = `
  SELECT
    mo.*,
    sp.name AS provider_name,
    COALESCE(
      json_agg(
        json_build_object(
          'id', mop.id,
          'photo_type', mop.photo_type,
          'url', mop.url,
          'caption', mop.caption,
          'created_date', mop.created_date
        )
        ORDER BY mop.created_date DESC
      ) FILTER (WHERE mop.id IS NOT NULL),
      '[]'::json
    ) AS photos
  FROM maintenance_orders mo
  LEFT JOIN service_providers sp ON sp.id = mo.service_provider_id
  LEFT JOIN maintenance_order_photos mop ON mop.order_id = mo.id
`

function groupByOrder () {
  return `
    GROUP BY mo.id, sp.name
    ORDER BY
      CASE mo.status
        WHEN 'requested' THEN 1
        WHEN 'quoted' THEN 2
        WHEN 'approved' THEN 3
        WHEN 'scheduled' THEN 4
        WHEN 'in_progress' THEN 5
        WHEN 'done' THEN 6
        ELSE 7
      END,
      mo.updated_date DESC
  `
}

export async function listContactMaintenanceOrders (req, res) {
  if (!assertUUID(res, req.params.id)) return

  try {
    const result = await pool.query(
      `${ORDER_SELECT}
       WHERE mo.contact_id = $1
       ${groupByOrder()}`,
      [req.params.id]
    )

    return res.json({ orders: result.rows })
  } catch (err) {
    return sendServerError(res, err)
  }
}

export async function createContactMaintenanceOrder (req, res) {
  if (!assertUUID(res, req.params.id)) return

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const contact = await client.query('SELECT id FROM crm_contacts WHERE id = $1 FOR UPDATE', [
      req.params.id
    ])
    if (!contact.rows[0]) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Contacto não encontrado.' })
    }

    const {
      property_id: propertyId,
      service_provider_id: serviceProviderId,
      title,
      service_type: serviceType,
      status,
      priority,
      description,
      provider_amount: providerAmount,
      coordination_fee: coordinationFee,
      scheduled_for: scheduledFor
    } = req.body

    const created = await client.query(
      `INSERT INTO maintenance_orders (
         contact_id, property_id, service_provider_id, title, service_type, status,
         priority, description, provider_amount, coordination_fee, scheduled_for,
         created_by, updated_by
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
       RETURNING *`,
      [
        req.params.id,
        propertyId ?? null,
        serviceProviderId ?? null,
        title,
        serviceType,
        status,
        priority,
        description ?? null,
        providerAmount ?? null,
        coordinationFee ?? null,
        scheduledFor ?? null,
        req.user.id
      ]
    )

    await client.query(
      `INSERT INTO crm_activities (contact_id, author_id, activity_type, content)
       VALUES ($1, $2, 'task', $3)`,
      [req.params.id, req.user.id, `Ordem de manutenção criada: ${title}.`]
    )
    await client.query('COMMIT')

    return res.status(201).json(created.rows[0])
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return sendServerError(res, err)
  } finally {
    client.release()
  }
}

export async function updateMaintenanceOrder (req, res) {
  if (!assertUUID(res, req.params.orderId, 'orderId')) return

  try {
    const fields = {
      property_id: req.body.property_id,
      service_provider_id: req.body.service_provider_id,
      title: req.body.title,
      service_type: req.body.service_type,
      status: req.body.status,
      priority: req.body.priority,
      description: req.body.description,
      provider_amount: req.body.provider_amount,
      coordination_fee: req.body.coordination_fee,
      scheduled_for: req.body.scheduled_for,
      completed_at: req.body.completed_at
    }
    const updates = []
    const params = []

    for (const [field, value] of Object.entries(fields)) {
      if (value !== undefined) {
        params.push(value)
        updates.push(`${field} = $${params.length}`)
      }
    }

    params.push(req.user.id)
    updates.push(`updated_by = $${params.length}`, 'updated_date = NOW()')
    params.push(req.params.orderId)

    const result = await pool.query(
      `UPDATE maintenance_orders
          SET ${updates.join(', ')}
        WHERE id = $${params.length}
        RETURNING *`,
      params
    )
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Ordem de manutenção não encontrada.' })
    }

    return res.json(result.rows[0])
  } catch (err) {
    return sendServerError(res, err)
  }
}

export async function createMaintenanceOrderPhoto (req, res) {
  if (!assertUUID(res, req.params.orderId, 'orderId')) return

  try {
    const order = await pool.query('SELECT id FROM maintenance_orders WHERE id = $1', [
      req.params.orderId
    ])
    if (!order.rows[0]) {
      return res.status(404).json({ error: 'Ordem de manutenção não encontrada.' })
    }

    const { photo_type: photoType, url, caption } = req.body
    const result = await pool.query(
      `INSERT INTO maintenance_order_photos (
         order_id, photo_type, url, caption, created_by
       )
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [req.params.orderId, photoType, url, caption ?? null, req.user.id]
    )

    return res.status(201).json(result.rows[0])
  } catch (err) {
    return sendServerError(res, err)
  }
}
