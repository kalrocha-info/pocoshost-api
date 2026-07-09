import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../testApp.js';
import { pool } from '../db/pool.js';
import { createUser } from './helpers/factories.js';

const app = createApp();

async function createAdmin(email = `maintenance-admin-${Date.now()}@example.test`) {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const result = await pool.query(
    `INSERT INTO users (
       full_name, email, password_hash, role, email_verified, email_verified_at
     )
     VALUES ('Admin Manutenção', $1, $2, 'admin', TRUE, NOW())
     RETURNING id, email, full_name, role`,
    [email, passwordHash],
  );
  const user = result.rows[0];
  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createContact() {
  const result = await pool.query(
    `INSERT INTO crm_contacts (full_name, email, contact_type, stage, source)
     VALUES ('Lead Manutenção', 'manutencao@example.test', 'host', 'lead', 'website_host_landing')
     RETURNING id`,
  );
  return result.rows[0];
}

describe('Manutenção administrativa — /api/admin', () => {
  it('restringe ordens de manutenção a administradores', async () => {
    const guest = await createUser({ email: 'maintenance-guest@example.test' });
    const contact = await createContact();

    const anonymous = await request(app).get(
      `/api/admin/crm/contacts/${contact.id}/maintenance-orders`,
    );
    const forbidden = await request(app)
      .get(`/api/admin/crm/contacts/${contact.id}/maintenance-orders`)
      .set(auth(guest.token));

    expect(anonymous.status).toBe(401);
    expect(forbidden.status).toBe(403);
  });

  it('cria, lista, atualiza e anexa fotos a uma ordem', async () => {
    const admin = await createAdmin();
    const contact = await createContact();

    const created = await request(app)
      .post(`/api/admin/crm/contacts/${contact.id}/maintenance-orders`)
      .set(auth(admin.token))
      .send({
        title: 'Vistoria inicial',
        service_type: 'inspection',
        priority: 'high',
        description: 'Avaliar enxoval e pequenos reparos antes da publicação.',
        provider_amount: 150,
        coordination_fee: 30,
      });

    expect(created.status).toBe(201);
    expect(created.body).toEqual(
      expect.objectContaining({
        contact_id: contact.id,
        title: 'Vistoria inicial',
        service_type: 'inspection',
        priority: 'high',
        status: 'requested',
        created_by: admin.user.id,
      }),
    );

    const updated = await request(app)
      .patch(`/api/admin/maintenance-orders/${created.body.id}`)
      .set(auth(admin.token))
      .send({
        status: 'scheduled',
        scheduled_for: '2026-07-12T13:00:00.000Z',
      });

    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe('scheduled');

    const photo = await request(app)
      .post(`/api/admin/maintenance-orders/${created.body.id}/photos`)
      .set(auth(admin.token))
      .send({
        photo_type: 'before',
        url: 'https://res.cloudinary.com/demo/image/upload/v1/antes.jpg',
        caption: 'Sala antes da preparação',
      });

    expect(photo.status).toBe(201);
    expect(photo.body.photo_type).toBe('before');

    const listed = await request(app)
      .get(`/api/admin/crm/contacts/${contact.id}/maintenance-orders`)
      .set(auth(admin.token));

    expect(listed.status).toBe(200);
    expect(listed.body.orders).toEqual([
      expect.objectContaining({
        id: created.body.id,
        title: 'Vistoria inicial',
        status: 'scheduled',
        photos: [
          expect.objectContaining({
            photo_type: 'before',
            url: 'https://res.cloudinary.com/demo/image/upload/v1/antes.jpg',
          }),
        ],
      }),
    ]);

    const activities = await pool.query(
      `SELECT content FROM crm_activities WHERE contact_id = $1 ORDER BY created_date DESC`,
      [contact.id],
    );
    expect(activities.rows[0].content).toContain('Ordem de manutenção criada');
  });

  it('valida payloads de manutenção', async () => {
    const admin = await createAdmin();
    const contact = await createContact();

    const invalid = await request(app)
      .post(`/api/admin/crm/contacts/${contact.id}/maintenance-orders`)
      .set(auth(admin.token))
      .send({
        title: 'x',
        service_type: 'pagamento',
        provider_amount: -10,
      });

    expect(invalid.status).toBe(400);
  });
});
