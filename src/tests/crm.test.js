import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../testApp.js';
import { pool } from '../db/pool.js';
import { createUser } from './helpers/factories.js';

const app = createApp();

async function createAdmin(email = `crm-admin-${Date.now()}@example.test`) {
  const passwordHash = await bcrypt.hash('senha123', 10);
  const result = await pool.query(
    `INSERT INTO users (
       full_name, email, password_hash, role, email_verified, email_verified_at
     )
     VALUES ('Admin CRM', $1, $2, 'admin', TRUE, NOW())
     RETURNING id, email, full_name, role`,
    [email, passwordHash]
  );
  const user = result.rows[0];
  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('CRM — /api/admin/crm', () => {
  it('restringe o CRM a administradores', async () => {
    const guest = await createUser({ email: 'crm-guest-access@example.test' });

    const anonymous = await request(app).get('/api/admin/crm/contacts');
    const forbidden = await request(app)
      .get('/api/admin/crm/contacts')
      .set(auth(guest.token));

    expect(anonymous.status).toBe(401);
    expect(forbidden.status).toBe(403);
  });

  it('sincroniza automaticamente utilizadores da plataforma', async () => {
    const admin = await createAdmin();
    const host = await createUser({
      email: 'crm-host-sync@example.test',
      full_name: 'Anfitrião Sincronizado',
      role: 'host',
      document_number: '11122233344',
    });

    const response = await request(app)
      .get('/api/admin/crm/contacts?contact_type=host')
      .set(auth(admin.token));

    expect(response.status).toBe(200);
    expect(response.body.contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: host.user.id,
          full_name: 'Anfitrião Sincronizado',
          contact_type: 'host',
          stage: 'active',
          source: 'platform',
        }),
      ])
    );
  });

  it('cria e lista um lead manual com métricas do funil', async () => {
    const admin = await createAdmin();
    const created = await request(app)
      .post('/api/admin/crm/contacts')
      .set(auth(admin.token))
      .send({
        full_name: 'Pousada Horizonte',
        email: 'contato@horizonte.example',
        phone: '(35) 99999-0000',
        contact_type: 'host',
        stage: 'lead',
        source: 'indicação',
        summary: 'Proprietário interessado em anunciar dois chalés.',
      });

    expect(created.status).toBe(201);
    expect(created.body.assigned_to).toBe(admin.user.id);

    const listed = await request(app)
      .get('/api/admin/crm/contacts?search=Horizonte&stage=lead')
      .set(auth(admin.token));

    expect(listed.status).toBe(200);
    expect(listed.body.contacts).toHaveLength(1);
    expect(listed.body.contacts[0].email).toBe('contato@horizonte.example');
    expect(listed.body.stats.total).toBe(1);
    expect(listed.body.stats.leads).toBe(1);
  });

  it('valida os dados de novos contactos', async () => {
    const admin = await createAdmin();
    const response = await request(app)
      .post('/api/admin/crm/contacts')
      .set(auth(admin.token))
      .send({
        full_name: 'A',
        email: 'email-invalido',
        contact_type: 'desconhecido',
      });

    expect(response.status).toBe(400);
  });

  it('atualiza etapa, resumo e próxima ação', async () => {
    const admin = await createAdmin();
    const created = await request(app)
      .post('/api/admin/crm/contacts')
      .set(auth(admin.token))
      .send({ full_name: 'Lead em Qualificação', contact_type: 'partner' });
    const nextAction = new Date(Date.now() + 86400000).toISOString();

    const updated = await request(app)
      .put(`/api/admin/crm/contacts/${created.body.id}`)
      .set(auth(admin.token))
      .send({
        stage: 'qualified',
        summary: 'Reunião inicial concluída.',
        next_action_at: nextAction,
      });

    expect(updated.status).toBe(200);
    expect(updated.body.stage).toBe('qualified');
    expect(updated.body.summary).toBe('Reunião inicial concluída.');
    expect(new Date(updated.body.next_action_at).toISOString()).toBe(nextAction);
  });

  it('regista atividade e expõe a linha temporal do contacto', async () => {
    const admin = await createAdmin();
    const created = await request(app)
      .post('/api/admin/crm/contacts')
      .set(auth(admin.token))
      .send({ full_name: 'Contacto com Histórico', contact_type: 'host' });

    const activity = await request(app)
      .post(`/api/admin/crm/contacts/${created.body.id}/activities`)
      .set(auth(admin.token))
      .send({
        activity_type: 'call',
        content: 'Apresentação da plataforma realizada.',
      });

    expect(activity.status).toBe(201);
    expect(activity.body.activity_type).toBe('call');

    const detail = await request(app)
      .get(`/api/admin/crm/contacts/${created.body.id}`)
      .set(auth(admin.token));

    expect(detail.status).toBe(200);
    expect(detail.body.last_contact_at).toBeTruthy();
    expect(detail.body.activities).toEqual([
      expect.objectContaining({
        content: 'Apresentação da plataforma realizada.',
        author_name: 'Admin CRM',
      }),
    ]);
  });

  it('cria e conclui uma tarefa', async () => {
    const admin = await createAdmin();
    const created = await request(app)
      .post('/api/admin/crm/contacts')
      .set(auth(admin.token))
      .send({ full_name: 'Contacto com Tarefa', contact_type: 'guest' });
    const dueAt = new Date(Date.now() + 3600000).toISOString();
    const task = await request(app)
      .post(`/api/admin/crm/contacts/${created.body.id}/activities`)
      .set(auth(admin.token))
      .send({
        activity_type: 'task',
        content: 'Enviar proposta comercial.',
        due_at: dueAt,
      });

    const completed = await request(app)
      .patch(`/api/admin/crm/activities/${task.body.id}`)
      .set(auth(admin.token))
      .send({ completed: true });

    expect(completed.status).toBe(200);
    expect(completed.body.completed_at).toBeTruthy();
  });

  it('remove contacto e respetiva atividade', async () => {
    const admin = await createAdmin();
    const created = await request(app)
      .post('/api/admin/crm/contacts')
      .set(auth(admin.token))
      .send({ full_name: 'Lead a Remover', contact_type: 'partner' });
    await request(app)
      .post(`/api/admin/crm/contacts/${created.body.id}/activities`)
      .set(auth(admin.token))
      .send({ activity_type: 'note', content: 'Sem interesse neste momento.' });

    const removed = await request(app)
      .delete(`/api/admin/crm/contacts/${created.body.id}`)
      .set(auth(admin.token));
    const activities = await pool.query(
      'SELECT COUNT(*)::int AS count FROM crm_activities WHERE contact_id = $1',
      [created.body.id]
    );

    expect(removed.status).toBe(204);
    expect(activities.rows[0].count).toBe(0);
  });
});
