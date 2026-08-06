import request from 'supertest'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createApp } from '../testApp.js'
import { pool } from '../db/pool.js'
import { createUser } from './helpers/factories.js'
import './helpers/setup.js'

const app = createApp()

async function createAdmin (overrides = {}) {
  const password = overrides.password ?? 'senha123'
  const passwordHash = await bcrypt.hash(password, 10)
  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role, email_verified, email_verified_at)
     VALUES ($1, $2, $3, 'admin', TRUE, NOW())
     RETURNING id, email, full_name, role`,
    [overrides.full_name ?? 'Admin Despesas', overrides.email ?? `admin_exp_${Date.now()}@example.test`, passwordHash]
  )
  const user = result.rows[0]
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )
  return { token, user }
}

async function createTestContract (token) {
  const res = await request(app)
    .post('/api/admin/contracts')
    .set('Authorization', `Bearer ${token}`)
    .send({ contract_number: `CT-EXP-${Date.now()}`, management_fee_pct: 20, start_date: '2025-01-01' })
  expect(res.status).toBe(201)
  return res.body
}

async function createTestStatement (token, contractId, overrides = {}) {
  const res = await request(app)
    .post(`/api/admin/contracts/${contractId}/statements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reference_month: overrides.reference_month ?? '2025-01', gross_revenue: overrides.gross_revenue ?? 10000, management_fee: 2000 })
  expect(res.status).toBe(201)
  return res.body
}

describe('CONTRACT EXPENSES — /api/admin/contracts/:id/expenses', () => {
  it('bloqueia acesso sem token', async () => {
    const res = await request(app).get('/api/admin/contracts/00000000-0000-0000-0000-000000000000/expenses')
    expect(res.status).toBe(401)
  })

  it('bloqueia guest nas rotas de despesas', async () => {
    const guest = await createUser()
    const res = await request(app)
      .get('/api/admin/contracts/00000000-0000-0000-0000-000000000000/expenses')
      .set('Authorization', `Bearer ${guest.token}`)
    expect(res.status).toBe(403)
  })

  it('admin lista despesas vazia para contrato novo', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)

    const res = await request(app)
      .get(`/api/admin/contracts/${contract.id}/expenses`)
      .set('Authorization', `Bearer ${admin.token}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toBeInstanceOf(Array)
    expect(res.body.total).toBe(0)
    expect(res.body.total_amount).toBe(0)
  })

  it('cria despesa operacional com dados mínimos', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)

    const res = await request(app)
      .post(`/api/admin/contracts/${contract.id}/expenses`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        description: 'Troca de fechadura digital',
        amount: 250.50
      })

    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    expect(res.body.category).toBe('maintenance')
    expect(res.body.description).toBe('Troca de fechadura digital')
    expect(Number(res.body.amount)).toBe(250.50)
  })

  it('cria despesa completa com categoria e URL de recibo', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)

    const res = await request(app)
      .post(`/api/admin/contracts/${contract.id}/expenses`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        category: 'cleaning',
        description: 'Faxina pós-check-out de réveillon',
        amount: 180.00,
        expense_date: '2025-01-05',
        receipt_url: 'https://example.com/recibo-123.pdf'
      })

    expect(res.status).toBe(201)
    expect(res.body.category).toBe('cleaning')
    expect(res.body.receipt_url).toBe('https://example.com/recibo-123.pdf')
    expect(res.body.expense_date).toMatch(/2025-01-05/)
  })

  it('rejeita criação de despesa com valor negativo ou zero', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)

    const res = await request(app)
      .post(`/api/admin/contracts/${contract.id}/expenses`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ description: 'Serviço', amount: 0 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/amount/)
  })

  it('rejeita categoria de despesa inválida', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)

    const res = await request(app)
      .post(`/api/admin/contracts/${contract.id}/expenses`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ description: 'Serviço', amount: 100, category: 'categoria_invalida' })
    expect(res.status).toBe(400)
  })

  it('recalcula despesas operacionais do balancete ao vincular uma nova despesa', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)
    const statement = await createTestStatement(admin.token, contract.id, { gross_revenue: 10000 })
    // Balancete inicial: gross 10000, fee 2000, operational 0, net 8000
    expect(Number(statement.operational_expenses)).toBe(0)
    expect(Number(statement.net_owner_payout)).toBe(8000)

    // Criar despesa 1 vinculada ao balancete (150)
    const exp1Res = await request(app)
      .post(`/api/admin/contracts/${contract.id}/expenses`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        description: 'Manutenção de torneira',
        amount: 150.00,
        statement_id: statement.id
      })
    expect(exp1Res.status).toBe(201)

    // Verificar se o balancete atualizou operational_expenses para 150 e net para 7850
    const stGet1 = await request(app)
      .get(`/api/admin/contracts/${contract.id}/statements`)
      .set('Authorization', `Bearer ${admin.token}`)
    const updatedSt1 = stGet1.body.data.find(s => s.id === statement.id)
    expect(Number(updatedSt1.operational_expenses)).toBe(150.00)
    expect(Number(updatedSt1.net_owner_payout)).toBe(7850.00)

    // Criar despesa 2 vinculada ao mesmo balancete (350)
    await request(app)
      .post(`/api/admin/contracts/${contract.id}/expenses`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        description: 'Pintura da varanda',
        amount: 350.00,
        statement_id: statement.id
      })

    // Deve somar 150 + 350 = 500
    const stGet2 = await request(app)
      .get(`/api/admin/contracts/${contract.id}/statements`)
      .set('Authorization', `Bearer ${admin.token}`)
    const updatedSt2 = stGet2.body.data.find(s => s.id === statement.id)
    expect(Number(updatedSt2.operational_expenses)).toBe(500.00)
    expect(Number(updatedSt2.net_owner_payout)).toBe(7500.00)
  })

  it('recalcula despesas do balancete ao atualizar valor da despesa', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)
    const statement = await createTestStatement(admin.token, contract.id)

    const expRes = await request(app)
      .post(`/api/admin/contracts/${contract.id}/expenses`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ description: 'Conserto de ar condicionado', amount: 200, statement_id: statement.id })

    // Alterar o valor de 200 para 400
    const updateRes = await request(app)
      .patch(`/api/admin/contracts/${contract.id}/expenses/${expRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ amount: 400 })
    expect(updateRes.status).toBe(200)

    const stGet = await request(app)
      .get(`/api/admin/contracts/${contract.id}/statements`)
      .set('Authorization', `Bearer ${admin.token}`)
    const updatedSt = stGet.body.data.find(s => s.id === statement.id)
    expect(Number(updatedSt.operational_expenses)).toBe(400.00)
  })

  it('recalcula despesas do balancete ao remover despesa', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)
    const statement = await createTestStatement(admin.token, contract.id)

    const expRes = await request(app)
      .post(`/api/admin/contracts/${contract.id}/expenses`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ description: 'Instalação de cortina', amount: 300, statement_id: statement.id })

    // Remover a despesa
    const deleteRes = await request(app)
      .delete(`/api/admin/contracts/${contract.id}/expenses/${expRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
    expect(deleteRes.status).toBe(200)

    const stGet = await request(app)
      .get(`/api/admin/contracts/${contract.id}/statements`)
      .set('Authorization', `Bearer ${admin.token}`)
    const updatedSt = stGet.body.data.find(s => s.id === statement.id)
    expect(Number(updatedSt.operational_expenses)).toBe(0)
  })

  it('isola despesa: impede alteração de despesa através de outro contrato', async () => {
    const admin = await createAdmin()
    const contract1 = await createTestContract(admin.token)
    const contract2 = await createTestContract(admin.token)

    const expRes = await request(app)
      .post(`/api/admin/contracts/${contract1.id}/expenses`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ description: 'Insumos de banheiro', amount: 80 })
    expect(expRes.status).toBe(201)

    // Tenta atualizar a despesa do contrato1 passando o id do contrato2 na URL
    const patchRes = await request(app)
      .patch(`/api/admin/contracts/${contract2.id}/expenses/${expRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ amount: 150 })
    expect(patchRes.status).toBe(404)
  })
})
