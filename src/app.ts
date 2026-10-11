import { Hono, type Context } from 'hono';
import { ReviewError, type ReviewService } from './review.js';

async function body(c: Context): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    throw new ReviewError(400, 'INVALID_JSON', 'Envie um objeto JSON válido.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReviewError(400, 'INVALID_INPUT', 'O corpo deve ser um objeto JSON.');
  }
  return value as Record<string, unknown>;
}

export function createApp(service: ReviewService) {
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof ReviewError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    console.error(error);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno.' } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } }, 404));
  app.post('/scripts', async (c) => {
    const input = await body(c);
    return c.json(service.create(input.content), 201);
  });
  app.get('/scripts/:id', (c) => c.json(service.get(c.req.param('id'))));
  app.post('/scripts/:id/revision-requests', async (c) => {
    const input = await body(c);
    return c.json(service.requestChanges(c.req.param('id'), input.reason, input.deadline_date), 201);
  });
  app.post('/scripts/:id/versions', async (c) => {
    const input = await body(c);
    return c.json(service.submitVersion(c.req.param('id'), input.content), 201);
  });
  app.post('/scripts/:id/approval', (c) => c.json(service.approve(c.req.param('id'))));
  return app;
}
