import { pool } from '../db/pool.js'
import { sendServerError } from '../utils/http.js'

function parsePagination (query) {
  const page = Math.max(Number(query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
  return { page, limit, offset: (page - 1) * limit }
}

// ============================================================
// Contratos de gestão
// ============================================================

export async function listContracts (req, res) {
  try {
    const { page, limit, offset } = parsePagination(req.query)
    const { status, property_id } = req.query

    const conditions = []
    const params = []
    let idx = 1

    if (status) {
      conditions.push(`mc.status = $${idx++}`)
      params.push(status)
    }
    if (property_id) {
      conditions.push(`mc.property_id = $${idx++}`)
      params.push(property_id)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM management_contracts mc ${where}`,
      params
    )
    const total = Number(countRes.rows[0].count)

    const rows = await pool.query(
      `SELECT
         mc.id, mc.contract_number, mc.status, mc.management_fee_pct,
         mc.start_date, mc.end_date, mc.notes, mc.created_date,
         p.title AS property_title, p.city AS property_city,
         u.full_name AS host_name, u.email AS host_email
       FROM management_contracts mc
       LEFT JOIN properties p ON mc.property_id = p.id
       LEFT JOIN users u ON mc.host_user_id = u.id
       ${where}
       ORDER BY mc.created_date DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    )

    res.json({ data: rows.rows, total, page, limit })
  } catch (err) {
    sendServerError(res, err)
  }
}

export async function getContract (req, res) {
  try {
    const { id } = req.params
    const result = await pool.query(
      `SELECT
         mc.id, mc.contract_number, mc.status, mc.management_fee_pct,
         mc.start_date, mc.end_date, mc.notes, mc.created_date, mc.updated_date,
         mc.property_id, mc.host_user_id,
         p.title AS property_title, p.city AS property_city,
         u.full_name AS host_name, u.email AS host_email
       FROM management_contracts mc
       LEFT JOIN properties p ON mc.property_id = p.id
       LEFT JOIN users u ON mc.host_user_id = u.id
       WHERE mc.id = $1`,
      [id]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Contrato não encontrado.' })
    res.json(result.rows[0])
  } catch (err) {
    sendServerError(res, err)
  }
}

export async function createContract (req, res) {
  try {
    const {
      property_id, host_user_id, contract_number,
      management_fee_pct, start_date, end_date, notes
    } = req.body

    const result = await pool.query(
      `INSERT INTO management_contracts
         (property_id, host_user_id, contract_number, management_fee_pct,
          start_date, end_date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        property_id ?? null,
        host_user_id ?? null,
        contract_number ?? null,
        management_fee_pct ?? 20,
        start_date,
        end_date ?? null,
        notes ?? null,
        req.user.id
      ]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.constraint === 'management_contracts_contract_number_key') {
      return res.status(409).json({ error: 'Número de contrato já cadastrado.' })
    }
    sendServerError(res, err)
  }
}

export async function updateContract (req, res) {
  try {
    const { id } = req.params
    const {
      status, management_fee_pct, end_date, notes, contract_number
    } = req.body

    const result = await pool.query(
      `UPDATE management_contracts
       SET
         status             = COALESCE($1, status),
         management_fee_pct = COALESCE($2, management_fee_pct),
         end_date           = COALESCE($3, end_date),
         notes              = COALESCE($4, notes),
         contract_number    = COALESCE($5, contract_number),
         updated_date       = NOW()
       WHERE id = $6
       RETURNING *`,
      [status ?? null, management_fee_pct ?? null, end_date ?? null, notes ?? null, contract_number ?? null, id]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Contrato não encontrado.' })
    res.json(result.rows[0])
  } catch (err) {
    if (err.constraint === 'management_contracts_contract_number_key') {
      return res.status(409).json({ error: 'Número de contrato já cadastrado.' })
    }
    sendServerError(res, err)
  }
}

// ============================================================
// Balancetes mensais (contract_statements)
// ============================================================

export async function listStatements (req, res) {
  try {
    const { id: contractId } = req.params

    // Verificar que o contrato existe
    const contractCheck = await pool.query(
      'SELECT id FROM management_contracts WHERE id = $1',
      [contractId]
    )
    if (!contractCheck.rows[0]) {
      return res.status(404).json({ error: 'Contrato não encontrado.' })
    }

    const rows = await pool.query(
      `SELECT
         id, contract_id, reference_month, gross_revenue,
         management_fee, operational_expenses, net_owner_payout,
         status, notes, issued_at, paid_at, created_date
       FROM contract_statements
       WHERE contract_id = $1
       ORDER BY reference_month DESC`,
      [contractId]
    )
    res.json({ data: rows.rows, total: rows.rowCount })
  } catch (err) {
    sendServerError(res, err)
  }
}

export async function createStatement (req, res) {
  try {
    const { id: contractId } = req.params
    const {
      reference_month, gross_revenue, management_fee,
      operational_expenses, status, notes
    } = req.body

    // Verificar que o contrato existe
    const contractCheck = await pool.query(
      'SELECT id FROM management_contracts WHERE id = $1',
      [contractId]
    )
    if (!contractCheck.rows[0]) {
      return res.status(404).json({ error: 'Contrato não encontrado.' })
    }

    const result = await pool.query(
      `INSERT INTO contract_statements
         (contract_id, reference_month, gross_revenue, management_fee,
          operational_expenses, status, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        contractId,
        reference_month,
        gross_revenue,
        management_fee ?? 0,
        operational_expenses ?? 0,
        status ?? 'draft',
        notes ?? null,
        req.user.id
      ]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.constraint === 'contract_statements_contract_id_reference_month_key') {
      return res.status(409).json({ error: 'Já existe um balancete para este mês neste contrato.' })
    }
    sendServerError(res, err)
  }
}

export async function updateStatement (req, res) {
  try {
    const { id: contractId, statementId } = req.params
    const {
      gross_revenue, management_fee, operational_expenses,
      status, notes, issued_at, paid_at
    } = req.body

    // Verificar que o balancete pertence ao contrato (isolamento)
    const check = await pool.query(
      'SELECT id FROM contract_statements WHERE id = $1 AND contract_id = $2',
      [statementId, contractId]
    )
    if (!check.rows[0]) {
      return res.status(404).json({ error: 'Balancete não encontrado.' })
    }

    const result = await pool.query(
      `UPDATE contract_statements
       SET
         gross_revenue        = COALESCE($1, gross_revenue),
         management_fee       = COALESCE($2, management_fee),
         operational_expenses = COALESCE($3, operational_expenses),
         status               = COALESCE($4, status),
         notes                = COALESCE($5, notes),
         issued_at            = COALESCE($6, issued_at),
         paid_at              = COALESCE($7, paid_at),
         updated_date         = NOW()
       WHERE id = $8 AND contract_id = $9
       RETURNING *`,
      [
        gross_revenue ?? null,
        management_fee ?? null,
        operational_expenses ?? null,
        status ?? null,
        notes ?? null,
        issued_at ?? null,
        paid_at ?? null,
        statementId,
        contractId
      ]
    )
    res.json(result.rows[0])
  } catch (err) {
    sendServerError(res, err)
  }
}
