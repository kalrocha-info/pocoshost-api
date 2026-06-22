import request from 'supertest';
import { createApp } from '../testApp.js';
import { createUser, createProperty } from './helpers/factories.js';

const app = createApp();

describe('FAVORITES — /api/favorites', () => {

  describe('POST /toggle', () => {
    it('adiciona favorito', async () => {
      const host = await createUser({ email: 'fh@example.test' });
      const guest = await createUser({ email: 'fg@example.test' });
      const prop = await createProperty(host.token);
      const res = await request(app).post('/api/favorites/toggle')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ property_id: prop.id });
      expect(res.status).toBe(200);
      expect(res.body.favorited).toBe(true);
    });

    it('remove favorito ao fazer toggle novamente', async () => {
      const host = await createUser({ email: 'fh2@example.test' });
      const guest = await createUser({ email: 'fg2@example.test' });
      const prop = await createProperty(host.token);
      await request(app).post('/api/favorites/toggle')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ property_id: prop.id });
      const res = await request(app).post('/api/favorites/toggle')
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ property_id: prop.id });
      expect(res.status).toBe(200);
      expect(res.body.favorited).toBe(false);
    });

    it('rejeita sem autenticação', async () => {
      const { token } = await createUser({ email: 'fh3@example.test' });
      const prop = await createProperty(token);
      const res = await request(app).post('/api/favorites/toggle')
        .send({ property_id: prop.id });
      expect(res.status).toBe(401);
    });

    it('rejeita sem property_id', async () => {
      const { token } = await createUser({ email: 'fg3@example.test' });
      const res = await request(app).post('/api/favorites/toggle')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /', () => {
    it('lista favoritos do utilizador', async () => {
      const host = await createUser({ email: 'lh@example.test' });
      const guest = await createUser({ email: 'lg@example.test' });
      const p1 = await createProperty(host.token, { title: 'Fav 1' });
      const p2 = await createProperty(host.token, { title: 'Fav 2' });
      await request(app).post('/api/favorites/toggle')
        .set('Authorization', `Bearer ${guest.token}`).send({ property_id: p1.id });
      await request(app).post('/api/favorites/toggle')
        .set('Authorization', `Bearer ${guest.token}`).send({ property_id: p2.id });
      const res = await request(app).get('/api/favorites')
        .set('Authorization', `Bearer ${guest.token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });

    it('não mostra favoritos de outros utilizadores', async () => {
      const host = await createUser({ email: 'lh2@example.test' });
      const g1 = await createUser({ email: 'lg2@example.test' });
      const g2 = await createUser({ email: 'lg3@example.test' });
      const prop = await createProperty(host.token);
      await request(app).post('/api/favorites/toggle')
        .set('Authorization', `Bearer ${g1.token}`).send({ property_id: prop.id });
      const res = await request(app).get('/api/favorites')
        .set('Authorization', `Bearer ${g2.token}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(0);
    });

    it('rejeita sem autenticação', async () => {
      const res = await request(app).get('/api/favorites');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /check/:propertyId', () => {
    it('confirma que imóvel está nos favoritos', async () => {
      const host = await createUser({ email: 'ch@example.test' });
      const guest = await createUser({ email: 'cg@example.test' });
      const prop = await createProperty(host.token);
      await request(app).post('/api/favorites/toggle')
        .set('Authorization', `Bearer ${guest.token}`).send({ property_id: prop.id });
      const res = await request(app).get(`/api/favorites/check/${prop.id}`)
        .set('Authorization', `Bearer ${guest.token}`);
      expect(res.status).toBe(200);
      expect(res.body.favorited).toBe(true);
    });

    it('confirma que imóvel não está nos favoritos', async () => {
      const host = await createUser({ email: 'ch2@example.test' });
      const guest = await createUser({ email: 'cg2@example.test' });
      const prop = await createProperty(host.token);
      const res = await request(app).get(`/api/favorites/check/${prop.id}`)
        .set('Authorization', `Bearer ${guest.token}`);
      expect(res.status).toBe(200);
      expect(res.body.favorited).toBe(false);
    });
  });
});
