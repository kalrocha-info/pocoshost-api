import request from 'supertest';
import { createApp } from '../testApp.js';
import { createUser, createProperty } from './helpers/factories.js';

const app = createApp();

describe('REVIEWS — /api/reviews', () => {

  describe('GET /property/:id', () => {
    it('lista avaliações de um imóvel publicamente', async () => {
      const { token } = await createUser({ email: 'rh@rv.com' });
      const prop = await createProperty(token);
      await request(app).post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ property_id: prop.id, rating: 5, comment: 'Excelente!' });
      const res = await request(app).get(`/api/reviews/property/${prop.id}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].rating).toBe(5);
    });

    it('devolve array vazio para imóvel sem avaliações', async () => {
      const { token } = await createUser({ email: 'rh2@rv.com' });
      const prop = await createProperty(token);
      const res = await request(app).get(`/api/reviews/property/${prop.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /', () => {
    it('cria avaliação com rating válido', async () => {
      const { token } = await createUser({ email: 'rg@rv.com' });
      const prop = await createProperty(token);
      const res = await request(app).post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ property_id: prop.id, rating: 4, comment: 'Muito bom!' });
      expect(res.status).toBe(201);
      expect(res.body.rating).toBe(4);
    });

    it('atualiza rating médio do imóvel após avaliação', async () => {
      const host = await createUser({ email: 'rh3@rv.com' });
      const g1 = await createUser({ email: 'rg1@rv.com' });
      const g2 = await createUser({ email: 'rg2@rv.com' });
      const prop = await createProperty(host.token);
      await request(app).post('/api/reviews').set('Authorization', `Bearer ${g1.token}`)
        .send({ property_id: prop.id, rating: 4 });
      await request(app).post('/api/reviews').set('Authorization', `Bearer ${g2.token}`)
        .send({ property_id: prop.id, rating: 2 });
      const propRes = await request(app).get(`/api/properties/${prop.id}`);
      expect(Number(propRes.body.rating)).toBe(3);
      expect(Number(propRes.body.review_count)).toBe(2);
    });

    it('rejeita rating fora do intervalo 1-5', async () => {
      const { token } = await createUser({ email: 'rg3@rv.com' });
      const prop = await createProperty(token);
      const res6 = await request(app).post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ property_id: prop.id, rating: 6 });
      expect(res6.status).toBeGreaterThanOrEqual(400);
      const res0 = await request(app).post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ property_id: prop.id, rating: 0 });
      expect(res0.status).toBeGreaterThanOrEqual(400);
    });

    it('rejeita sem property_id', async () => {
      const { token } = await createUser({ email: 'rg4@rv.com' });
      const res = await request(app).post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 5 });
      expect(res.status).toBe(400);
    });

    it('rejeita sem autenticação', async () => {
      const { token } = await createUser({ email: 'rg5@rv.com' });
      const prop = await createProperty(token);
      const res = await request(app).post('/api/reviews')
        .send({ property_id: prop.id, rating: 5 });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /:id', () => {
    it('elimina avaliação do próprio utilizador', async () => {
      const { token } = await createUser({ email: 'rd@rv.com' });
      const prop = await createProperty(token);
      const rev = await request(app).post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ property_id: prop.id, rating: 3 });
      const res = await request(app).delete(`/api/reviews/${rev.body.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('impede eliminação por outro utilizador', async () => {
      const u1 = await createUser({ email: 'rd1@rv.com' });
      const u2 = await createUser({ email: 'rd2@rv.com' });
      const prop = await createProperty(u1.token);
      const rev = await request(app).post('/api/reviews')
        .set('Authorization', `Bearer ${u1.token}`)
        .send({ property_id: prop.id, rating: 5 });
      const res = await request(app).delete(`/api/reviews/${rev.body.id}`)
        .set('Authorization', `Bearer ${u2.token}`);
      expect(res.status).toBe(404);
    });
  });
});
