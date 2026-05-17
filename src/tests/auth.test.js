import request from 'supertest';
import { createApp } from '../testApp.js';
import { createUser } from './helpers/factories.js';

const app = createApp();

describe('AUTH — /api/auth', () => {

  describe('POST /register', () => {
    it('regista um novo utilizador com dados válidos', async () => {
      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Carlos Teste',
        email: 'carlos@teste.com',
        password: 'senha123',
      });
      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('carlos@teste.com');
      expect(res.body.user.password_hash).toBeUndefined();
    });

    it('rejeita registo sem email', async () => {
      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Sem Email', password: 'senha123',
      });
      expect(res.status).toBe(400);
    });

    it('rejeita registo sem password', async () => {
      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Sem Pass', email: 'sempass@teste.com',
      });
      expect(res.status).toBe(400);
    });

    it('rejeita registo sem full_name', async () => {
      const res = await request(app).post('/api/auth/register').send({
        email: 'semnome@teste.com', password: 'senha123',
      });
      expect(res.status).toBe(400);
    });

    it('rejeita email duplicado', async () => {
      await request(app).post('/api/auth/register').send({
        full_name: 'Primeiro', email: 'dup@teste.com', password: 'senha123',
      });
      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Segundo', email: 'dup@teste.com', password: 'outrasenha',
      });
      expect(res.status).toBe(409);
    });

    it('não expõe password_hash na resposta', async () => {
      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Seguro', email: 'seguro@teste.com', password: 'senha123',
      });
      expect(res.body.user.password_hash).toBeUndefined();
    });
  });

  describe('POST /login', () => {
    it('faz login com credenciais corretas', async () => {
      await createUser({ email: 'login@teste.com', password: 'senha123' });
      const res = await request(app).post('/api/auth/login').send({
        email: 'login@teste.com', password: 'senha123',
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('rejeita password errada', async () => {
      await createUser({ email: 'wrong@teste.com', password: 'correta' });
      const res = await request(app).post('/api/auth/login').send({
        email: 'wrong@teste.com', password: 'errada',
      });
      expect(res.status).toBe(401);
    });

    it('rejeita email inexistente', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'naoexiste@teste.com', password: 'qualquer',
      });
      expect(res.status).toBe(401);
    });

    it('rejeita login sem campos', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /me', () => {
    it('devolve o utilizador autenticado', async () => {
      const { token, user } = await createUser();
      const res = await request(app).get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(user.email);
    });

    it('rejeita sem token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('rejeita token inválido', async () => {
      const res = await request(app).get('/api/auth/me')
        .set('Authorization', 'Bearer token_invalido');
      expect(res.status).toBe(401);
    });

    it('rejeita token malformado', async () => {
      const res = await request(app).get('/api/auth/me')
        .set('Authorization', 'InvalidFormat');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /me', () => {
    it('atualiza o perfil do utilizador', async () => {
      const { token } = await createUser();
      const res = await request(app).put('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ full_name: 'Nome Atualizado', phone: '35999999999' });
      expect(res.status).toBe(200);
      expect(res.body.full_name).toBe('Nome Atualizado');
      expect(res.body.phone).toBe('35999999999');
    });

    it('rejeita atualização sem autenticação', async () => {
      const res = await request(app).put('/api/auth/me').send({ full_name: 'Hacker' });
      expect(res.status).toBe(401);
    });
  });
});
