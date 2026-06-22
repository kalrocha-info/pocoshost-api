import request from 'supertest';
import { beforeEach, vi } from 'vitest';
import { createApp } from '../testApp.js';
import { createUser, createProperty, createReservation } from './helpers/factories.js';
import { testPool } from './helpers/setup.js';

const verificationEmails = vi.hoisted(() => []);
const passwordResetEmails = vi.hoisted(() => []);

vi.mock('../services/emailService.js', async () => {
  const actual = await vi.importActual('../services/emailService.js');
  return {
    ...actual,
    sendEmailVerification: vi.fn(async (user, token) => {
      verificationEmails.push({ user, token });
      return { mock: true };
    }),
    sendPasswordReset: vi.fn(async (user, token) => {
      passwordResetEmails.push({ user, token });
      return { mock: true };
    }),
  };
});

const app = createApp();

describe('AUTH — /api/auth', () => {
  beforeEach(() => {
    verificationEmails.length = 0;
    passwordResetEmails.length = 0;
  });

  describe('POST /register', () => {
    it('regista um novo utilizador pendente de verificação de e-mail', async () => {
      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Carlos Teste',
        email: 'carlos@example.test',
        password: 'SenhaForte1!',
      });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeUndefined();
      expect(res.body.email_verification_required).toBe(true);
      expect(res.body.user.email).toBe('carlos@example.test');
      expect(res.body.user.email_verified).toBe(false);
      expect(res.body.user.password_hash).toBeUndefined();
      expect(verificationEmails).toHaveLength(1);
      expect(verificationEmails[0].user.email).toBe('carlos@example.test');
      expect(verificationEmails[0].token).toBeTruthy();
    });

    it('rejeita registo sem email', async () => {
      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Sem Email', password: 'SenhaForte1!',
      });
      expect(res.status).toBe(400);
    });

    it('rejeita registo sem password', async () => {
      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Sem Pass', email: 'sempass@example.test',
      });
      expect(res.status).toBe(400);
    });

    it('rejeita registo sem full_name', async () => {
      const res = await request(app).post('/api/auth/register').send({
        email: 'semnome@example.test', password: 'SenhaForte1!',
      });
      expect(res.status).toBe(400);
    });

    it('rejeita email duplicado', async () => {
      await request(app).post('/api/auth/register').send({
        full_name: 'Primeiro', email: 'dup@example.test', password: 'SenhaForte1!',
      });
      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Segundo', email: 'dup@example.test', password: 'OutraSenha1!',
      });
      expect(res.status).toBe(409);
    });

    it('rejeita CPF duplicado para anfitriões mesmo com formatação diferente', async () => {
      await request(app).post('/api/auth/register').send({
        full_name: 'Anfitrião Um',
        email: 'host-doc-1@example.test',
        password: 'SenhaForte1!',
        role: 'host',
        document_type: 'CPF',
        document_number: '123.456.789-09',
      });

      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Anfitrião Dois',
        email: 'host-doc-2@example.test',
        password: 'OutraSenha1!',
        role: 'host',
        document_type: 'CPF',
        document_number: '12345678909',
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/CPF\/CNPJ já cadastrado/i);
    });

    it('não expõe password_hash na resposta', async () => {
      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Seguro', email: 'seguro@example.test', password: 'SenhaForte1!',
      });
      expect(res.body.user.password_hash).toBeUndefined();
    });

    it('rejeita senha sem complexidade minima', async () => {
      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Senha Fraca',
        email: 'senha-fraca@example.test',
        password: 'senha123',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/10 caracteres|maiúscula|caractere especial/i);
    });
  });

  describe('Verificação de e-mail', () => {
    it('ativa a conta com token enviado por e-mail e permite login', async () => {
      await request(app).post('/api/auth/register').send({
        full_name: 'Verificar Email', email: 'verificar@example.test', password: 'SenhaForte1!',
      });

      const token = verificationEmails[0].token;
      const verify = await request(app).post('/api/auth/verify-email').send({ token });

      expect(verify.status).toBe(200);
      expect(verify.body.token).toBeDefined();
      expect(verify.body.user.email_verified).toBe(true);

      const login = await request(app).post('/api/auth/login').send({
        email: 'verificar@example.test', password: 'SenhaForte1!',
      });
      expect(login.status).toBe(200);
      expect(login.body.token).toBeDefined();
    });

    it('rejeita token inválido', async () => {
      const res = await request(app).post('/api/auth/verify-email').send({ token: 'invalido' });
      expect(res.status).toBe(400);
    });

    it('reenvia link de verificação sem revelar se a conta existe', async () => {
      await request(app).post('/api/auth/register').send({
        full_name: 'Reenvio', email: 'reenvio@example.test', password: 'SenhaForte1!',
      });
      verificationEmails.length = 0;

      const existing = await request(app).post('/api/auth/resend-verification').send({
        email: 'reenvio@example.test',
      });
      expect(existing.status).toBe(200);
      expect(verificationEmails).toHaveLength(1);

      const unknown = await request(app).post('/api/auth/resend-verification').send({
        email: 'desconhecido@example.test',
      });
      expect(unknown.status).toBe(200);
    });
  });

  describe('Redefinição de senha', () => {
    it('envia link sem revelar se a conta existe e permite redefinir senha', async () => {
      await createUser({ email: 'reset@example.test', password: 'SenhaAntiga1!' });

      const requestReset = await request(app).post('/api/auth/forgot-password').send({
        email: 'reset@example.test',
      });
      expect(requestReset.status).toBe(200);
      expect(passwordResetEmails).toHaveLength(1);

      const reset = await request(app).post('/api/auth/reset-password').send({
        token: passwordResetEmails[0].token,
        password: 'SenhaNova1!',
      });
      expect(reset.status).toBe(200);

      const oldLogin = await request(app).post('/api/auth/login').send({
        email: 'reset@example.test',
        password: 'SenhaAntiga1!',
      });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app).post('/api/auth/login').send({
        email: 'reset@example.test',
        password: 'SenhaNova1!',
      });
      expect(newLogin.status).toBe(200);

      const unknown = await request(app).post('/api/auth/forgot-password').send({
        email: 'desconhecido-reset@example.test',
      });
      expect(unknown.status).toBe(200);
    });

    it('rejeita token inválido e senha fraca', async () => {
      const weak = await request(app).post('/api/auth/reset-password').send({
        token: 'token_invalido_com_tamanho_suficiente_1234567890',
        password: 'senha123',
      });
      expect(weak.status).toBe(400);

      const invalid = await request(app).post('/api/auth/reset-password').send({
        token: 'token_invalido_com_tamanho_suficiente_1234567890',
        password: 'SenhaNova1!',
      });
      expect(invalid.status).toBe(400);
    });
  });

  describe('POST /login', () => {
    it('faz login com credenciais corretas quando o e-mail está verificado', async () => {
      await createUser({ email: 'login@example.test', password: 'senha123' });
      const res = await request(app).post('/api/auth/login').send({
        email: 'login@example.test', password: 'senha123',
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('bloqueia login enquanto o e-mail não foi verificado', async () => {
      await request(app).post('/api/auth/register').send({
        full_name: 'Pendente', email: 'pendente@example.test', password: 'SenhaForte1!',
      });
      const res = await request(app).post('/api/auth/login').send({
        email: 'pendente@example.test', password: 'SenhaForte1!',
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('bloqueia login de conta bloqueada', async () => {
      const { user } = await createUser({ email: 'blocked-login@example.test', password: 'senha123' });
      await testPool.query("UPDATE users SET account_status = 'blocked' WHERE id = $1", [user.id]);

      const res = await request(app).post('/api/auth/login').send({
        email: 'blocked-login@example.test',
        password: 'senha123',
      });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_BLOCKED');
    });

    it('rejeita password errada', async () => {
      await createUser({ email: 'wrong@example.test', password: 'correta' });
      const res = await request(app).post('/api/auth/login').send({
        email: 'wrong@example.test', password: 'errada',
      });
      expect(res.status).toBe(401);
    });

    it('rejeita email inexistente', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'naoexiste@example.test', password: 'qualquer',
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
      expect(res.body.email_verified).toBe(true);
    });

    it('rejeita token existente depois que a conta é bloqueada', async () => {
      const { token, user } = await createUser({ email: 'blocked-token@example.test' });
      await testPool.query("UPDATE users SET account_status = 'blocked' WHERE id = $1", [user.id]);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
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
        .send({ full_name: 'Nome Atualizado', phone: '00000000000' });
      expect(res.status).toBe(200);
      expect(res.body.full_name).toBe('Nome Atualizado');
      expect(res.body.phone).toBe('00000000000');
    });

    it('rejeita atualização sem autenticação', async () => {
      const res = await request(app).put('/api/auth/me').send({ full_name: 'Hacker' });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /me', () => {
    it('anonimiza a própria conta e invalida o token antigo', async () => {
      const { token, user, password } = await createUser({
        full_name: 'Titular LGPD',
        email: 'titular-lgpd@example.test',
      });

      const res = await request(app).delete('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, anonymized: true });

      const me = await request(app).get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(me.status).toBe(401);

      const login = await request(app).post('/api/auth/login').send({
        email: user.email,
        password,
      });
      expect(login.status).toBe(401);

      const stored = await testPool.query(
        'SELECT full_name, email, phone, document_number, is_anonymized, anonymized_at, email_verified FROM users WHERE id = $1',
        [user.id]
      );
      expect(stored.rows[0].full_name).toBe('Usuário excluído');
      expect(stored.rows[0].email).toBe(`deleted+${user.id}@pocoshost.local`);
      expect(stored.rows[0].phone).toBeNull();
      expect(stored.rows[0].document_number).toBeNull();
      expect(stored.rows[0].is_anonymized).toBe(true);
      expect(stored.rows[0].email_verified).toBe(false);
      expect(stored.rows[0].anonymized_at).toBeTruthy();
    });

    it('bloqueia autoexclusão quando há reserva ativa como hóspede', async () => {
      const host = await createUser({ email: 'host-active-lgpd@example.test' });
      const guest = await createUser({ email: 'guest-active-lgpd@example.test' });
      const prop = await createProperty(host.token);
      await createReservation(guest.token, prop.id);

      const res = await request(app).delete('/api/auth/me')
        .set('Authorization', `Bearer ${guest.token}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/reservas pendentes ou confirmadas/i);
    });

    it('anonimiza dados pessoais em reservas e pagamentos históricos', async () => {
      const host = await createUser({ email: 'host-history-lgpd@example.test' });
      const guest = await createUser({ email: 'guest-history-lgpd@example.test' });
      const prop = await createProperty(host.token);
      const resv = await createReservation(guest.token, prop.id);

      await request(app).patch(`/api/reservations/${resv.id}/status`)
        .set('Authorization', `Bearer ${guest.token}`)
        .send({ status: 'cancelled' });

      await testPool.query(
        `INSERT INTO payments
          (reservation_id, property_title, guest_email, host_email, total_amount,
           platform_fee, host_net, status, billing_type, gateway_payment_id, gateway_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [resv.id, 'Pousada Teste', guest.user.email, host.user.email, 300, 46.5, 253.5,
         'refunded', 'PIX', 'pay_history_lgpd', 'REFUNDED']
      );

      const res = await request(app).delete('/api/auth/me')
        .set('Authorization', `Bearer ${guest.token}`);
      expect(res.status).toBe(200);

      const reservation = await testPool.query(
        'SELECT guest_id, guest_email, guest_name FROM reservations WHERE id = $1',
        [resv.id]
      );
      expect(reservation.rows[0].guest_id).toBeNull();
      expect(reservation.rows[0].guest_email).toBeNull();
      expect(reservation.rows[0].guest_name).toBe('Usuário excluído');

      const payment = await testPool.query(
        'SELECT guest_email, host_email, gateway_payment_id, gateway_status FROM payments WHERE reservation_id = $1',
        [resv.id]
      );
      expect(payment.rows[0].guest_email).toBeNull();
      expect(payment.rows[0].host_email).toBe(host.user.email);
      expect(payment.rows[0].gateway_payment_id).toBe('pay_history_lgpd');
      expect(payment.rows[0].gateway_status).toBe('REFUNDED');
    });

    it('rejeita autoexclusão sem autenticação', async () => {
      const res = await request(app).delete('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });
});
