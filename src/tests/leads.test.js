import request from 'supertest'
import { createApp } from '../testApp.js'
import { pool } from '../db/pool.js'

const app = createApp()

const validLead = {
  full_name: 'Maria Anfitriã',
  email: 'maria.host@example.test',
  phone: '(35) 99999-1234',
  property_type: 'chale',
  city: 'Poços de Caldas',
  neighborhood: 'Centro',
  bedrooms: 2,
  management_interest: 'complete_management',
  property_status: 'ready',
  accepts_maintenance_coordination: true,
  notes: 'Imóvel mobiliado e disponível para avaliação.',
  privacy_accepted: true,
  contact_consent: true,
  marketing_consent: true,
  utm_source: 'instagram',
  utm_medium: 'social',
  utm_campaign: 'captacao_julho',
  landing_page: '/become-a-host?utm_source=instagram',
  referrer: 'https://instagram.com/'
}

describe('Leads públicos — /api/leads', () => {
  it('cria lead de anfitrião com atribuição e consentimento', async () => {
    const response = await request(app).post('/api/leads/host').send(validLead)

    expect(response.status).toBe(201)
    expect(response.body).toEqual(expect.objectContaining({ success: true }))

    const contact = await pool.query('SELECT * FROM crm_contacts WHERE email = $1', [
      validLead.email
    ])
    expect(contact.rows[0]).toEqual(
      expect.objectContaining({
        full_name: validLead.full_name,
        contact_type: 'host',
        stage: 'lead',
        source: 'website_host_landing',
        utm_source: 'instagram',
        marketing_consent: true
      })
    )
    expect(contact.rows[0].privacy_accepted_at).toBeTruthy()
    expect(contact.rows[0].contact_consent_at).toBeTruthy()

    const profile = await pool.query('SELECT * FROM host_lead_profiles WHERE contact_id = $1', [
      contact.rows[0].id
    ])
    expect(profile.rows[0]).toEqual(
      expect.objectContaining({
        property_type: 'chale',
        city: 'Poços de Caldas',
        neighborhood: 'Centro',
        bedrooms: 2,
        management_interest: 'complete_management',
        property_status: 'ready',
        accepts_maintenance_coordination: true
      })
    )
  })

  it('deduplica reenvio por e-mail e mantém histórico de atividades', async () => {
    await request(app).post('/api/leads/host').send(validLead)
    const response = await request(app)
      .post('/api/leads/host')
      .send({
        ...validLead,
        phone: '(35) 98888-4321',
        utm_campaign: 'retargeting',
        neighborhood: 'Jardim dos Estados',
        bedrooms: 3
      })

    expect(response.status).toBe(201)
    const contacts = await pool.query(
      'SELECT id, utm_campaign FROM crm_contacts WHERE email = $1',
      [validLead.email]
    )
    expect(contacts.rows).toHaveLength(1)
    expect(contacts.rows[0].utm_campaign).toBe('retargeting')

    const activities = await pool.query(
      'SELECT COUNT(*)::int AS count FROM crm_activities WHERE contact_id = $1',
      [contacts.rows[0].id]
    )
    expect(activities.rows[0].count).toBe(2)

    const profile = await pool.query(
      'SELECT neighborhood, bedrooms FROM host_lead_profiles WHERE contact_id = $1',
      [contacts.rows[0].id]
    )
    expect(profile.rows[0]).toEqual(
      expect.objectContaining({
        neighborhood: 'Jardim dos Estados',
        bedrooms: 3
      })
    )
  })

  it('rejeita lead sem aceite de privacidade e autorização de contato', async () => {
    const response = await request(app)
      .post('/api/leads/host')
      .send({
        ...validLead,
        privacy_accepted: false,
        contact_consent: false
      })

    expect(response.status).toBe(400)
  })

  it('descarta silenciosamente submissão capturada pelo honeypot', async () => {
    const response = await request(app)
      .post('/api/leads/host')
      .send({
        ...validLead,
        website: 'https://spam.example'
      })

    expect(response.status).toBe(202)
    const contacts = await pool.query('SELECT id FROM crm_contacts WHERE email = $1', [
      validLead.email
    ])
    expect(contacts.rows).toHaveLength(0)
  })

  it('vincula o lead existente quando o anfitrião cria a conta', async () => {
    await request(app).post('/api/leads/host').send(validLead)
    const registration = await request(app).post('/api/auth/register').send({
      full_name: validLead.full_name,
      email: validLead.email,
      password: 'SenhaForte@123',
      role: 'host',
      document_type: 'CPF',
      document_number: '12345678901',
      utm_source: 'instagram',
      utm_campaign: 'cadastro_posterior'
    })

    expect(registration.status).toBe(201)
    const contacts = await pool.query('SELECT * FROM crm_contacts WHERE email = $1', [
      validLead.email
    ])
    expect(contacts.rows).toHaveLength(1)
    expect(contacts.rows[0]).toEqual(
      expect.objectContaining({
        user_id: registration.body.user.id,
        stage: 'onboarding',
        source: 'website_host_landing',
        utm_campaign: 'cadastro_posterior'
      })
    )
  })
})
