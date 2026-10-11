import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Clock } from '../src/clock.js';
import { openDatabase } from '../src/database.js';
import { ReviewError, ReviewService, type ScriptView } from '../src/review.js';

class FixedClock implements Clock {
  instant = '2026-03-12T15:00:00.000Z';
  now() { return new Date(this.instant); }
}

let db: DatabaseSync;
let clock: FixedClock;
let service: ReviewService;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = openDatabase();
  clock = new FixedClock();
  service = new ReviewService(db, clock);
  app = createApp(service);
});
afterEach(() => db.close());

function post(path: string, input?: unknown) {
  return app.request(path, {
    method: 'POST',
    ...(input === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }),
  });
}

describe('fluxo, versões e aprovação', () => {
  it('percorre a API inteira, preserva V1 e liga o pedido a V2', async () => {
    const creation = await post('/scripts', { content: 'Roteiro original' });
    expect(creation.status).toBe(201);
    const first = await creation.json() as ReturnType<ReviewService['create']>;
    expect(first.script.status).toBe('in_review');
    expect(first.version.number).toBe(1);

    const change = await post(`/scripts/${first.script.id}/revision-requests`, {
      reason: 'Explicar melhor o benefício', deadline_date: '2026-03-12',
    });
    expect(change.status).toBe(201);
    const request = await change.json() as ReturnType<ReviewService['requestChanges']>;
    const pending = await app.request(`/scripts/${first.script.id}`);
    expect((await pending.json() as ScriptView).status).toBe('changes_requested');

    const submission = await post(`/scripts/${first.script.id}/versions`, { content: 'Roteiro revisado' });
    expect(submission.status).toBe(201);
    const second = await submission.json() as ReturnType<ReviewService['submitVersion']>;
    expect(second.script.status).toBe('in_review');
    const approval = await post(`/scripts/${first.script.id}/approval`);
    expect(approval.status).toBe(200);
    expect(await approval.json()).toEqual({
      script_id: first.script.id, status: 'approved', approved_version_id: second.version.id,
      approved_at: clock.instant,
    });

    const response = await app.request(`/scripts/${first.script.id}`);
    expect(response.status).toBe(200);
    const view = await response.json() as ScriptView;
    expect(view.status).toBe('approved');
    expect(view.current_version).toEqual(second.version);
    expect(view.versions).toEqual([first.version, second.version]);
    expect(second.version.previous_version_id).toBe(first.version.id);
    expect(view.revision_requests).toEqual([{ ...request, fulfilled_by_version_id: second.version.id }]);
    expect(view.history.map((event) => event.type)).toEqual([
      'script_created', 'changes_requested', 'version_submitted', 'approved',
    ]);
    expect(view.history.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(view.history[2]!.data).toEqual({
      version_id: second.version.id, previous_version_id: first.version.id, request_id: request.id,
    });
  });

  it('mantém três versões, pedidos separados e isolamento entre roteiros', () => {
    const a = service.create('A1');
    const b = service.create('B1');
    const originalB = service.get(b.script.id);
    service.requestChanges(a.script.id, 'Ajuste 1', '2026-03-12');
    const v2 = service.submitVersion(a.script.id, 'A2').version;
    service.requestChanges(a.script.id, 'Ajuste 2', '2026-03-13');
    const v3 = service.submitVersion(a.script.id, 'A3').version;
    const view = service.get(a.script.id);
    expect(view.versions.map((v) => v.number)).toEqual([1, 2, 3]);
    expect(view.versions[0]).toEqual(a.version);
    expect(v3.previous_version_id).toBe(v2.id);
    expect(view.revision_requests.map((r) => r.fulfilled_by_version_id)).toEqual([v2.id, v3.id]);
    expect(view.history.map((e) => e.sequence)).toEqual([1, 3, 4, 5, 6]);
    expect(service.get(b.script.id)).toEqual(originalB);
  });

  it('recusa reenvio sem pedido aberto, segundo pedido e aprovação com alteração pendente', async () => {
    const { script } = service.create('Original');
    let before = service.get(script.id);
    expect((await post(`/scripts/${script.id}/versions`, { content: 'Sem pedido' })).status).toBe(409);
    expect(service.get(script.id)).toEqual(before);
    service.requestChanges(script.id, 'Ajustar', '2026-03-12');
    before = service.get(script.id);
    expect((await post(`/scripts/${script.id}/revision-requests`, {
      reason: 'Outro pedido', deadline_date: '2026-03-13',
    })).status).toBe(409);
    expect((await post(`/scripts/${script.id}/approval`)).status).toBe(409);
    expect(service.get(script.id)).toEqual(before);
  });

  it('aprovação é terminal e seu retry preserva data, versão e histórico', async () => {
    const { script } = service.create('Original');
    const first = await post(`/scripts/${script.id}/approval`);
    const approved = await first.json();
    const before = service.get(script.id);
    clock.instant = '2026-03-20T18:00:00.000Z';
    const retry = await post(`/scripts/${script.id}/approval`);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(approved);
    expect((await post(`/scripts/${script.id}/versions`, { content: 'Tentativa tardia' })).status).toBe(409);
    expect((await post(`/scripts/${script.id}/revision-requests`, {
      reason: 'Tentativa tardia', deadline_date: '2026-03-21',
    })).status).toBe(409);
    expect(service.get(script.id)).toEqual(before);
    expect(before.history.filter((e) => e.type === 'approved')).toHaveLength(1);
  });
});

describe('validação sem efeitos colaterais', () => {
  it.each([undefined, null, '', ' \t\n', 42, [], {}])('recusa motivo inválido: %j', async (reason) => {
    const { script } = service.create('Original');
    const before = service.get(script.id);
    const response = await post(`/scripts/${script.id}/revision-requests`, { reason, deadline_date: '2026-03-12' });
    expect(response.status).toBe(400);
    expect(service.get(script.id)).toEqual(before);
  });

  it.each([
    undefined, null, '', '2026-2-03', '2026-02-30', '2026-02-29', '2026-13-01', '2026-00-01',
    '2026-03-00', '0000-01-01', '2026-03-12T00:00:00Z', ' 2026-03-12 ', 20260312,
  ])('recusa prazo inválido: %j', async (deadline) => {
    const { script } = service.create('Original');
    const before = service.get(script.id);
    const response = await post(`/scripts/${script.id}/revision-requests`, { reason: 'Ajustar', deadline_date: deadline });
    expect(response.status).toBe(400);
    expect(service.get(script.id)).toEqual(before);
  });

  it('aceita a data civil de um ano bissexto válido', () => {
    clock.instant = '2028-02-29T15:00:00.000Z';
    const { script } = service.create('Original');
    expect(service.requestChanges(script.id, 'Ajustar', '2028-02-29').deadline_date).toBe('2028-02-29');
  });

  it.each([undefined, null, '', '  \n ', 12, false])('recusa conteúdo inválido na criação e no reenvio: %j', async (content) => {
    const empty = await post('/scripts', { content });
    expect(empty.status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS total FROM scripts').get()!.total).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS total FROM review_events').get()!.total).toBe(0);
    const { script } = service.create('Original');
    service.requestChanges(script.id, 'Ajustar', '2026-03-12');
    const before = service.get(script.id);
    expect((await post(`/scripts/${script.id}/versions`, { content })).status).toBe(400);
    expect(service.get(script.id)).toEqual(before);
  });

  it.each(['{', '', '[]', 'null', '42', '"texto"'])('trata corpo inválido: %s', async (raw) => {
    const response = await app.request('/scripts', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: raw,
    });
    expect(response.status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS total FROM scripts').get()!.total).toBe(0);
    const json = await response.json() as { error: { code: string; message: string } };
    expect(json.error.code).toMatch(/^INVALID_(JSON|INPUT)$/);
    expect(json.error.message.length).toBeGreaterThan(0);
  });

  it('retorna 404 para recursos ausentes em todos os endpoints', async () => {
    expect((await app.request('/scripts/missing')).status).toBe(404);
    expect((await post('/scripts/missing/approval')).status).toBe(404);
    expect((await post('/scripts/missing/versions', { content: 'Novo' })).status).toBe(404);
    expect((await post('/scripts/missing/revision-requests', {
      reason: 'Ajustar', deadline_date: '2026-03-12',
    })).status).toBe(404);
    expect((await app.request('/unknown')).status).toBe(404);
  });
});

describe('prazo inclusivo em America/Sao_Paulo com relógio controlado', () => {
  it.each([
    ['2026-03-13T02:59:59.999Z', 201],
    ['2026-03-13T03:00:00.000Z', 409],
  ])('pedido no instante %s retorna %i', async (instant, status) => {
    const { script } = service.create('Original');
    const before = service.get(script.id);
    clock.instant = instant;
    const response = await post(`/scripts/${script.id}/revision-requests`, {
      reason: 'Ajustar', deadline_date: '2026-03-12',
    });
    expect(response.status).toBe(status);
    if (status === 409) {
      expect(await response.json()).toMatchObject({ error: { code: 'DEADLINE_PASSED' } });
      expect(service.get(script.id)).toEqual(before);
    } else {
      expect(service.get(script.id).status).toBe('changes_requested');
    }
  });

  it.each([
    ['2026-03-13T02:59:59.999Z', 201],
    ['2026-03-13T03:00:00.000Z', 409],
  ])('reenvio no instante %s retorna %i', async (instant, status) => {
    const { script } = service.create('Original');
    service.requestChanges(script.id, 'Ajustar', '2026-03-12');
    const before = service.get(script.id);
    clock.instant = instant;
    const response = await post(`/scripts/${script.id}/versions`, { content: 'Revisado' });
    expect(response.status).toBe(status);
    if (status === 409) {
      expect(await response.json()).toMatchObject({ error: { code: 'DEADLINE_PASSED' } });
      expect(service.get(script.id)).toEqual(before);
    } else {
      expect(service.get(script.id).versions).toHaveLength(2);
      expect(service.get(script.id).status).toBe('in_review');
    }
  });

  it('recusa uma data anterior ao dia civil atual', () => {
    const { script } = service.create('Original');
    const before = service.get(script.id);
    expect(() => service.requestChanges(script.id, 'Ajustar', '2026-03-11'))
      .toThrowError(expect.objectContaining({ status: 409, code: 'DEADLINE_PASSED' }));
    expect(service.get(script.id)).toEqual(before);
  });

  it('usa a regra histórica do fuso em vez de fixar o offset -03', () => {
    clock.instant = '2018-11-05T01:59:59.999Z';
    const { script } = service.create('Original');
    service.requestChanges(script.id, 'Ajustar', '2018-11-04');
    clock.instant = '2018-11-05T02:00:00.000Z';
    expect(() => service.submitVersion(script.id, 'Revisado')).toThrowError(ReviewError);
    expect(service.get(script.id).versions).toHaveLength(1);
  });
});

describe('transações e persistência', () => {
  it('falha na gravação do histórico desfaz pedido e mudança de estado', () => {
    const { script } = service.create('Original');
    const before = service.get(script.id);
    db.exec(`CREATE TRIGGER reject_event BEFORE INSERT ON review_events BEGIN
      SELECT RAISE(ABORT, 'Falha simulada'); END;`);
    expect(() => service.requestChanges(script.id, 'Ajustar', '2026-03-12')).toThrow('Falha simulada');
    expect(service.get(script.id)).toEqual(before);
    db.exec('DROP TRIGGER reject_event');
    expect(service.requestChanges(script.id, 'Ajustar', '2026-03-12').reason).toBe('Ajustar');
  });

  it('falha no histórico do reenvio desfaz versão, cumprimento e estado', () => {
    const { script } = service.create('Original');
    service.requestChanges(script.id, 'Ajustar', '2026-03-12');
    const before = service.get(script.id);
    db.exec(`CREATE TRIGGER reject_event BEFORE INSERT ON review_events BEGIN
      SELECT RAISE(ABORT, 'Falha simulada'); END;`);
    expect(() => service.submitVersion(script.id, 'Revisado')).toThrow('Falha simulada');
    expect(service.get(script.id)).toEqual(before);
  });

  it('sobrevive à reabertura e duas conexões mantêm um pedido e uma aprovação', () => {
    const directory = mkdtempSync(join(tmpdir(), 'conty-review-'));
    const path = join(directory, 'review.sqlite');
    const firstDb = openDatabase(path);
    const secondDb = openDatabase(path);
    try {
      const first = new ReviewService(firstDb, clock);
      const second = new ReviewService(secondDb, clock);
      const { script } = first.create('Original');
      first.requestChanges(script.id, 'Ajustar', '2026-03-12');
      expect(() => second.requestChanges(script.id, 'Outro pedido', '2026-03-12')).toThrowError(ReviewError);
      second.submitVersion(script.id, 'Revisado');
      const approval = first.approve(script.id);
      clock.instant = '2026-03-13T15:00:00.000Z';
      expect(second.approve(script.id)).toEqual(approval);
      const expected = second.get(script.id);
      firstDb.close();
      const reopened = openDatabase(path);
      try {
        expect(new ReviewService(reopened, clock).get(script.id)).toEqual(expected);
      } finally { reopened.close(); }
    } finally {
      if (firstDb.isOpen) firstDb.close();
      secondDb.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
