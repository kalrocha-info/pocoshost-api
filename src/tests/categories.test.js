import request from 'supertest';
import { createApp } from '../testApp.js';
import { createUser } from './helpers/factories.js';

const app = createApp();

describe('CATEGORIES — /api/categories', () => {
  it('lists categories without authentication', async () => {
    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(200);
    expect(res.body.some((category) => category.slug === 'pousada')).toBe(true);
  });

  it('rejects category creation without authentication', async () => {
    const res = await request(app)
      .post('/api/categories')
      .send({ name: 'Loft', slug: 'loft' });

    expect(res.status).toBe(401);
  });

  it('rejects category creation by a guest', async () => {
    const guest = await createUser();
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${guest.token}`)
      .send({ name: 'Loft', slug: 'loft' });

    expect(res.status).toBe(403);
  });

  it('creates and removes a category as admin', async () => {
    const admin = await createUser({ role: 'admin' });
    const created = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Loft', slug: 'loft', description: 'Lofts de teste' });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Loft', slug: 'loft' });

    const removed = await request(app)
      .delete('/api/categories/loft')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ success: true });
  });

  it('rejects a duplicate slug', async () => {
    const admin = await createUser({ role: 'admin' });
    const payload = { name: 'Loft', slug: 'loft' };

    await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(payload);
    const duplicate = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(payload);

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatch(/slug já existe/i);
  });

  it('returns 404 when removing an unknown category', async () => {
    const admin = await createUser({ role: 'admin' });
    const res = await request(app)
      .delete('/api/categories/inexistente')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(404);
  });
});
