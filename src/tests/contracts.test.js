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
    [overrides.full_name ?? 'Admin Contratos', overrides.email ?? `admin_contracts_${Date.now()}@example.test`, passwordHash]
  )
  const user = result.rows[0]
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )
  return { token, user }
}

const CONTRACT_PAYLOAD = {
  contract_number: null,
  management_fee_pct: 20,
  start_date: '2025-01-01'
}

// ============================================================
// Contratos de Gestão
// ============================================================

describe('CONTRACTS — /api/admin/contracts', () => {
  it('bloqueia acesso sem token', async () => {
    const res = await request(app).get('/api/admin/contracts')
    expect(res.status).toBe(401)
  })

  it('bloqueia guest em rotas de contratos', async () => {
    const guest = await createUser()
    const res = await request(app)
      .get('/api/admin/contracts')
      .set('Authorization', `Bearer ${guest.token}`)
    expect(res.status).toBe(403)
  })

  it('admin lista contratos (lista vazia inicialmente)', async () => {
    const admin = await createAdmin()
    const res = await request(app)
      .get('/api/admin/contracts')
      .set('Authorization', `Bearer ${admin.token}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toBeInstanceOf(Array)
    expect(res.body.total).toBe(0)
  })

  it('admin cria contrato com campos mínimos', async () => {
    const admin = await createAdmin()
    const res = await request(app)
      .post('/api/admin/contracts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(CONTRACT_PAYLOAD)

    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    expect(res.body.status).toBe('active')
    expect(Number(res.body.management_fee_pct)).toBe(20)
    expect(res.body.start_date).toBeDefined()
  })

  it('rejeita contrato sem start_date', async () => {
    const admin = await createAdmin()
    const res = await request(app)
      .post('/api/admin/contracts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ management_fee_pct: 20 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/start_date/)
  })

  it('rejeita management_fee_pct > 100', async () => {
    const admin = await createAdmin()
    const res = await request(app)
      .post('/api/admin/contracts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ...CONTRACT_PAYLOAD, management_fee_pct: 150 })
    expect(res.status).toBe(400)
  })

  it('admin busca contrato por id', async () => {
    const admin = await createAdmin()
    const createRes = await request(app)
      .post('/api/admin/contracts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(CONTRACT_PAYLOAD)
    expect(createRes.status).toBe(201)

    const getRes = await request(app)
      .get(`/api/admin/contracts/${createRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
    expect(getRes.status).toBe(200)
    expect(getRes.body.id).toBe(createRes.body.id)
  })

  it('retorna 404 para contrato inexistente', async () => {
    const admin = await createAdmin()
    const res = await request(app)
      .get('/api/admin/contracts/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${admin.token}`)
    expect(res.status).toBe(404)
  })

  it('admin atualiza status do contrato', async () => {
    const admin = await createAdmin()
    const createRes = await request(app)
      .post('/api/admin/contracts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(CONTRACT_PAYLOAD)

    const patchRes = await request(app)
      .patch(`/api/admin/contracts/${createRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'suspended' })
    expect(patchRes.status).toBe(200)
    expect(patchRes.body.status).toBe('suspended')
  })

  it('rejeita status inválido no update', async () => {
    const admin = await createAdmin()
    const createRes = await request(app)
      .post('/api/admin/contracts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(CONTRACT_PAYLOAD)

    const patchRes = await request(app)
      .patch(`/api/admin/contracts/${createRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'invalid_status' })
    expect(patchRes.status).toBe(400)
  })

  it('rejeita contract_number duplicado', async () => {
    const admin = await createAdmin()
    await request(app)
      .post('/api/admin/contracts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ...CONTRACT_PAYLOAD, contract_number: 'CT-001' })

    const dupRes = await request(app)
      .post('/api/admin/contracts')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ ...CONTRACT_PAYLOAD, contract_number: 'CT-001' })
    expect(dupRes.status).toBe(409)
  })
})

// ============================================================
// Balancetes Mensais
// ============================================================

describe('CONTRACT STATEMENTS — /api/admin/contracts/:id/statements', () => {
  async function createTestContract (token) {
    const res = await request(app)
      .post('/api/admin/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...CONTRACT_PAYLOAD, contract_number: `CT-${Date.now()}` })
    expect(res.status).toBe(201)
    return res.body
  }

  it('lista balancetes vazia de contrato recém-criado', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)

    const res = await request(app)
      .get(`/api/admin/contracts/${contract.id}/statements`)
      .set('Authorization', `Bearer ${admin.token}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toBeInstanceOf(Array)
    expect(res.body.data.length).toBe(0)
  })

  it('cria balancete com dados mínimos', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)

    const res = await request(app)
      .post(`/api/admin/contracts/${contract.id}/statements`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reference_month: '2025-01', gross_revenue: 5000 })

    expect(res.status).toBe(201)
    expect(res.body.reference_month).toBe('2025-01')
    expect(Number(res.body.gross_revenue)).toBe(5000)
    expect(Number(res.body.management_fee)).toBe(0)
    expect(Number(res.body.operational_expenses)).toBe(0)
    // net_owner_payout = 5000 - 0 - 0 = 5000
    expect(Number(res.body.net_owner_payout)).toBe(5000)
    expect(res.body.status).toBe('draft')
  })

  it('calcula net_owner_payout corretamente', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)

    const res = await request(app)
      .post(`/api/admin/contracts/${contract.id}/statements`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        reference_month: '2025-02',
        gross_revenue: 10000,
        management_fee: 2000,
        operational_expenses: 500
      })

    expect(res.status).toBe(201)
    // net = 10000 - 2000 - 500 = 7500
    expect(Number(res.body.net_owner_payout)).toBe(7500)
  })

  it('rejeita balancete sem reference_month', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)

    const res = await request(app)
      .post(`/api/admin/contracts/${contract.id}/statements`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ gross_revenue: 3000 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/reference_month/)
  })

  it('rejeita formato de reference_month inválido', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)

    const res = await request(app)
      .post(`/api/admin/contracts/${contract.id}/statements`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reference_month: '01/2025', gross_revenue: 3000 })
    expect(res.status).toBe(400)
  })

  it('rejeita gross_revenue negativo', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)

    const res = await request(app)
      .post(`/api/admin/contracts/${contract.id}/statements`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reference_month: '2025-03', gross_revenue: -100 })
    expect(res.status).toBe(400)
  })

  it('rejeita balancete duplicado no mesmo mês', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)

    await request(app)
      .post(`/api/admin/contracts/${contract.id}/statements`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reference_month: '2025-04', gross_revenue: 5000 })

    const dupRes = await request(app)
      .post(`/api/admin/contracts/${contract.id}/statements`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reference_month: '2025-04', gross_revenue: 6000 })
    expect(dupRes.status).toBe(409)
  })

  it('retorna 404 para balancete de contrato inexistente', async () => {
    const admin = await createAdmin()
    const res = await request(app)
      .get('/api/admin/contracts/00000000-0000-0000-0000-000000000000/statements')
      .set('Authorization', `Bearer ${admin.token}`)
    expect(res.status).toBe(404)
  })

  it('atualiza balancete (status → issued)', async () => {
    const admin = await createAdmin()
    const contract = await createTestContract(admin.token)

    const createRes = await request(app)
      .post(`/api/admin/contracts/${contract.id}/statements`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reference_month: '2025-05', gross_revenue: 8000 })
    expect(createRes.status).toBe(201)

    const patchRes = await request(app)
      .patch(`/api/admin/contracts/${contract.id}/statements/${createRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'issued', issued_at: new Date().toISOString() })
    expect(patchRes.status).toBe(200)
    expect(patchRes.body.status).toBe('issued')
    expect(patchRes.body.issued_at).toBeTruthy()
  })

  it('isola balancete: rejeita update de balancete de outro contrato', async () => {
    const admin = await createAdmin()
    const contract1 = await createTestContract(admin.token)
    const contract2 = await createTestContract(admin.token)

    const stRes = await request(app)
      .post(`/api/admin/contracts/${contract1.id}/statements`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reference_month: '2025-06', gross_revenue: 5000 })
    expect(stRes.status).toBe(201)

    // Tenta atualizar o balancete do contrato1 usando a rota do contrato2
    const patchRes = await request(app)
      .patch(`/api/admin/contracts/${contract2.id}/statements/${stRes.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'paid' })
    expect(patchRes.status).toBe(404)
  })

  it('bloqueia guest em rotas de balancetes', async () => {
    const guest = await createUser()
    const res = await request(app)
      .get('/api/admin/contracts/00000000-0000-0000-0000-000000000000/statements')
      .set('Authorization', `Bearer ${guest.token}`)
    expect(res.status).toBe(403)
  })
})
