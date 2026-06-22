import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../testApp.js';

const app = createApp();

describe('Monitoring — health e client errors', () => {
  it('retorna liveness publico', async () => {
    const res = await request(app).get('/api/health/live');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('pocoshost-api');
    expect(typeof res.body.uptime_seconds).toBe('number');
  });

  it('retorna readiness com banco disponivel', async () => {
    const res = await request(app).get('/api/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database).toBe('ok');
  });

  it('aceita erro sanitizado do frontend sem exigir autenticacao', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await request(app)
      .post('/api/monitoring/client-error')
      .send({
        message: 'Erro de UI',
        source: 'error-boundary',
        path: '/property/demo',
        userAgent: 'Vitest',
        stack: 'stack curta',
        token: 'nao-deve-aparecer',
      });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).not.toContain('nao-deve-aparecer');

    warnSpy.mockRestore();
  });
});
