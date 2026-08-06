import { pool } from '../db/pool.js'
import { sendServerError } from '../utils/http.js'

function parsePagination (query) {
  const page = Math.max(Number(query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
  return { page, limit, offset: (page - 1) * limit }
}

/**
 * Recalcula operational_expenses de um balancete caso ele esteja vinculado a despesas.
 */
async function syncStatementOperationalExpenses (client, statementId) {
  if (!statementId) return
  await client.query(
    `UPDATE contract_statements
     SET operational_expenses = (
       SELECT COALESCE(SUM(amount), 0)
       FROM contract_expenses
       WHERE statement_id = $1
     ),
     updated_date = NOW()
     WHERE id = $1`,
    [statementId]
  )
}

export async function listExpenses (req, res) {
  try {
    const { id: contractId } = req.params
    const { page, limit, offset } = parsePagination(req.query)
    const { category, statement_id: statementId, start_date: startDate, end_date: endDate } = req.query

    // Verificar se contrato existe
    const contractCheck = await pool.query(
      'SELECT id FROM management_contracts WHERE id = $1',
      [contractId]
    )
    if (!contractCheck.rows[0]) {
      return res.status(404).json({ error: 'Contrato não encontrado.' })
    }

    const conditions = ['contract_id = $1']
    const params = [contractId]
    let idx = 2

    if (category) {
      conditions.push(`category = $${idx++}`)
      params.push(category)
    }
    if (statementId) {
      conditions.push(`statement_id = $${idx++}`)
      params.push(statementId)
    }
    if (startDate) {
      conditions.push(`expense_date >= $${idx++}`)
      params.push(startDate)
    }
    if (endDate) {
      conditions.push(`expense_date <= $${idx++}`)
      params.push(endDate)
    }

    const where = conditions.join(' AND ')

    const countRes = await pool.query(
      `SELECT COUNT(*), COALESCE(SUM(amount), 0) AS total_amount FROM contract_expenses WHERE ${where}`,
      params
    )
    const total = Number(countRes.rows[0].count)
    const totalAmount = Number(countRes.rows[0].total_amount)

    const rows = await pool.query(
      `SELECT
         id, contract_id, statement_id, category, description,
         amount, expense_date, receipt_url, created_date, updated_date
       FROM contract_expenses
       WHERE ${where}
       ORDER BY expense_date DESC, created_date DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    )

    res.json({ data: rows.rows, total, total_amount: totalAmount, page, limit })
  } catch (err) {
    sendServerError(res, err)
  }
}

export async function getExpense (req, res) {
  try {
    const { id: contractId, expenseId } = req.params

    const result = await pool.query(
      `SELECT
         id, contract_id, statement_id, category, description,
         amount, expense_date, receipt_url, created_date, updated_date
       FROM contract_expenses
       WHERE id = $1 AND contract_id = $2`,
      [expenseId, contractId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Despesa não encontrada.' })
    res.json(result.rows[0])
  } catch (err) {
    sendServerError(res, err)
  }
}

export async function createExpense (req, res) {
  const client = await pool.connect()
  try {
    const { id: contractId } = req.params
    const {
      category, description, amount, expense_date: expenseDate,
      statement_id: statementId, receipt_url: receiptUrl
    } = req.body

    // Verificar se contrato existe
    const contractCheck = await client.query(
      'SELECT id FROM management_contracts WHERE id = $1',
      [contractId]
    )
    if (!contractCheck.rows[0]) {
      return res.status(404).json({ error: 'Contrato não encontrado.' })
    }

    // Se informou statement_id, validar que pertence ao mesmo contrato
    if (statementId) {
      const stCheck = await client.query(
        'SELECT id FROM contract_statements WHERE id = $1 AND contract_id = $2',
        [statementId, contractId]
      )
      if (!stCheck.rows[0]) {
        return res.status(400).json({ error: 'Balancete informado não pertence a este contrato.' })
      }
    }

    await client.query('BEGIN')

    const result = await client.query(
      `INSERT INTO contract_expenses
         (contract_id, statement_id, category, description, amount, expense_date, receipt_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        contractId,
        statementId ?? null,
        category ?? 'maintenance',
        description,
        amount,
        expenseDate ?? new Date().toISOString().split('T')[0],
        receiptUrl ?? null,
        req.user.id
      ]
    )

    if (statementId) {
      await syncStatementOperationalExpenses(client, statementId)
    }

    await client.query('COMMIT')
    res.status(201).json(result.rows[0])
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    sendServerError(res, err)
  } finally {
    client.release()
  }
}

export async function updateExpense (req, res) {
  const client = await pool.connect()
  try {
    const { id: contractId, expenseId } = req.params
    const {
      category, description, amount, expense_date: expenseDate,
      statement_id: statementId, receipt_url: receiptUrl
    } = req.body

    // Buscar a despesa atual para verificar isolamento e se mudou de statement
    const currentRes = await client.query(
      'SELECT id, statement_id FROM contract_expenses WHERE id = $1 AND contract_id = $2',
      [expenseId, contractId]
    )
    if (!currentRes.rows[0]) {
      return res.status(404).json({ error: 'Despesa não encontrada.' })
    }
    const oldStatementId = currentRes.rows[0].statement_id

    // Se o statementId mudou, validar o novo
    if (statementId !== undefined && statementId !== null) {
      const stCheck = await client.query(
        'SELECT id FROM contract_statements WHERE id = $1 AND contract_id = $2',
        [statementId, contractId]
      )
      if (!stCheck.rows[0]) {
        return res.status(400).json({ error: 'Balancete informado não pertence a este contrato.' })
      }
    }

    await client.query('BEGIN')

    const result = await client.query(
      `UPDATE contract_expenses
       SET
         category     = COALESCE($1, category),
         description  = COALESCE($2, description),
         amount       = COALESCE($3, amount),
         expense_date = COALESCE($4, expense_date),
         statement_id = CASE WHEN $5::uuid IS NULL THEN statement_id ELSE $5::uuid END,
         receipt_url  = COALESCE($6, receipt_url),
         updated_date = NOW()
       WHERE id = $7 AND contract_id = $8
       RETURNING *`,
      [
        category ?? null,
        description ?? null,
        amount ?? null,
        expenseDate ?? null,
        statementId ?? null,
        receiptUrl ?? null,
        expenseId,
        contractId
      ]
    )

    // Recalcular no antigo e no novo se aplicável
    if (oldStatementId) {
      await syncStatementOperationalExpenses(client, oldStatementId)
    }
    const newStatementId = result.rows[0].statement_id
    if (newStatementId && newStatementId !== oldStatementId) {
      await syncStatementOperationalExpenses(client, newStatementId)
    }

    await client.query('COMMIT')
    res.json(result.rows[0])
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    sendServerError(res, err)
  } finally {
    client.release()
  }
}

export async function deleteExpense (req, res) {
  const client = await pool.connect()
  try {
    const { id: contractId, expenseId } = req.params

    const currentRes = await client.query(
      'SELECT id, statement_id FROM contract_expenses WHERE id = $1 AND contract_id = $2',
      [expenseId, contractId]
    )
    if (!currentRes.rows[0]) {
      return res.status(404).json({ error: 'Despesa não encontrada.' })
    }
    const statementId = currentRes.rows[0].statement_id

    await client.query('BEGIN')

    await client.query(
      'DELETE FROM contract_expenses WHERE id = $1 AND contract_id = $2',
      [expenseId, contractId]
    )

    if (statementId) {
      await syncStatementOperationalExpenses(client, statementId)
    }

    await client.query('COMMIT')
    res.json({ message: 'Despesa removida com sucesso.' })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    sendServerError(res, err)
  } finally {
    client.release()
  }
}
