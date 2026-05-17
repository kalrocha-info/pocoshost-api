import request from 'supertest';
import { createApp } from '../testApp.js';
import { createUser, createProperty } from './helpers/factories.js';

const app = createApp();

describe('PROPERTIES — /api/properties', () => {

  describe('GET /', () => {
    it('lista imóveis públicos sem autenticação', async () => {
      const { token } = await createUser();
      await createProperty(token);
      const res = await request(app).get('/api/properties');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('filtra por categoria', async () => {
      const { token } = await createUser();
      await createProperty(token, { category: 'chale', title: 'Chalé A' });
      await createProperty(token, { category: 'pousada', title: 'Pousada B' });
      const res = await request(app).get('/api/properties?category=chale');
      expect(res.status).toBe(200);
      expect(res.body.every(p => p.category === 'chale')).toBe(true);
    });

    it('filtra por cidade (case insensitive)', async () => {
      const { token } = await createUser();
      await createProperty(token, { city: 'Andradas' });
      await createProperty(token, { city: 'Poços de Caldas' });
      const res = await request(app).get('/api/properties?city=andradas');
      expect(res.status).toBe(200);
      expect(res.body.every(p => p.city.toLowerCase().includes('andradas'))).toBe(true);
    });

    it('filtra por número de hóspedes', async () => {
      const { token } = await createUser();
      await createProperty(token, { max_guests: 2, title: 'Pequeno' });
      await createProperty(token, { max_guests: 8, title: 'Grande' });
      const res = await request(app).get('/api/properties?guests=5');
      expect(res.status).toBe(200);
      expect(res.body.every(p => p.max_guests >= 5)).toBe(true);
    });
  });

  describe('GET /:id', () => {
    it('devolve imóvel por ID', async () => {
      const { token } = await createUser();
      const prop = await createProperty(token);
      const res = await request(app).get(`/api/properties/${prop.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(prop.id);
    });

    it('devolve 404 para ID inexistente', async () => {
      const res = await request(app).get('/api/properties/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });

    it('devolve 500 para ID com formato inválido', async () => {
      const res = await request(app).get('/api/properties/id-invalido');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /', () => {
    it('cria imóvel com dados válidos', async () => {
      const { token } = await createUser();
      const res = await request(app).post('/api/properties')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Casa Nova', city: 'Caldas', category: 'casa',
          price_per_night: 400, max_guests: 6,
        });
      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Casa Nova');
    });

    it('rejeita criação sem autenticação', async () => {
      const res = await request(app).post('/api/properties').send({
        title: 'Invasão', city: 'Caldas', category: 'casa', price_per_night: 100,
      });
      expect(res.status).toBe(401);
    });

    it('rejeita criação sem título', async () => {
      const { token } = await createUser();
      const res = await request(app).post('/api/properties')
        .set('Authorization', `Bearer ${token}`)
        .send({ city: 'Caldas', category: 'casa', price_per_night: 100 });
      expect(res.status).toBe(400);
    });

    it('rejeita categoria inválida', async () => {
      const { token } = await createUser();
      const res = await request(app).post('/api/properties')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'X', city: 'Y', category: 'invalida', price_per_night: 100 });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('rejeita price_per_night negativo', async () => {
      const { token } = await createUser();
      const res = await request(app).post('/api/properties')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'X', city: 'Y', category: 'casa', price_per_night: -50 });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('PUT /:id', () => {
    it('atualiza imóvel do próprio utilizador', async () => {
      const { token } = await createUser();
      const prop = await createProperty(token);
      const res = await request(app).put(`/api/properties/${prop.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Título Atualizado' });
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Título Atualizado');
    });

    it('impede atualização por outro utilizador', async () => {
      const owner = await createUser({ email: 'owner@test.com' });
      const other = await createUser({ email: 'other@test.com' });
      const prop = await createProperty(owner.token);
      const res = await request(app).put(`/api/properties/${prop.id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({ title: 'Invasão' });
      expect(res.status).toBe(404);
    });

    it('rejeita atualização sem autenticação', async () => {
      const { token } = await createUser();
      const prop = await createProperty(token);
      const res = await request(app).put(`/api/properties/${prop.id}`)
        .send({ title: 'Sem Auth' });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /:id', () => {
    it('elimina imóvel do próprio utilizador', async () => {
      const { token } = await createUser();
      const prop = await createProperty(token);
      const res = await request(app).delete(`/api/properties/${prop.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const check = await request(app).get(`/api/properties/${prop.id}`);
      expect(check.status).toBe(404);
    });

    it('impede eliminação por outro utilizador', async () => {
      const owner = await createUser({ email: 'owner2@test.com' });
      const other = await createUser({ email: 'other2@test.com' });
      const prop = await createProperty(owner.token);
      const res = await request(app).delete(`/api/properties/${prop.id}`)
        .set('Authorization', `Bearer ${other.token}`);
      expect(res.status).toBe(404);
    });
  });
});
