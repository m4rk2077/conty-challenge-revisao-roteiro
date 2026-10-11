import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/database.js';
import { ReviewService, type ScriptView } from '../src/review.js';

// A demonstração sobe um servidor HTTP real, com banco isolado e relógio fixo.
let instant = '2026-03-12T15:00:00.000Z';
let nextId = 1;
const db = openDatabase();
const service = new ReviewService(db, { now: () => new Date(instant) },
  () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`);
const server = serve({ fetch: createApp(service).fetch, hostname: '127.0.0.1', port: 0 });
if (!server.listening) await once(server, 'listening');
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;
const lines = [
  '# Exemplos executados por HTTP', '',
  'Gerado por `npm run demo`: servidor Hono em porta livre, SQLite em memória, IDs determinísticos e relógio controlado. A API normal usa UUIDs aleatórios e relógio do sistema.', '',
  'Os comandos abaixo usam a porta padrão 3000 para facilitar a reprodução. O prazo fixo dos exemplos é histórico; no servidor normal, use uma data atual ou futura de São Paulo.', '',
];
let requests = 0;
async function request<T>(method: string, path: string, expected: number, input?: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    ...(input === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }),
  });
  assert.equal(response.status, expected);
  const value = await response.json() as T;
  requests++;
  const data = input === undefined ? '' : ` -H 'Content-Type: application/json' -d '${JSON.stringify(input)}'`;
  lines.push(`## ${requests}. ${method} ${path}`, '', `Relógio: \`${instant}\`.`, '',
    '```sh', `curl -X ${method} 'http://127.0.0.1:3000${path}'${data}`, '```', '',
    `Resposta HTTP ${response.status}:`, '', '```json', JSON.stringify(value, null, 2), '```', '');
  return value;
}

try {
  const created = await request<ReturnType<ReviewService['create']>>('POST', '/scripts', 201, {
    content: 'Apresentar o produto e convidar para conhecer a marca.',
  });
  const id = created.script.id;
  await request('POST', `/scripts/${id}/revision-requests`, 201, {
    reason: 'Mostrar o benefício antes do convite.', deadline_date: '2026-03-12',
  });
  instant = '2026-03-13T02:59:59.999Z';
  await request('POST', `/scripts/${id}/versions`, 201, {
    content: 'Mostrar o benefício, apresentar o produto e convidar para conhecer a marca.',
  });
  instant = '2026-03-13T15:00:00.000Z';
  const approval = await request('POST', `/scripts/${id}/approval`, 200);
  const view = await request<ScriptView>('GET', `/scripts/${id}`, 200);
  assert.equal(view.versions.length, 2);
  assert.equal(view.history.length, 4);
  instant = '2026-03-14T15:00:00.000Z';
  assert.deepEqual(await request('POST', `/scripts/${id}/approval`, 200), approval);
  await request('POST', `/scripts/${id}/versions`, 409, { content: 'Tentativa após aprovação.' });
  await request('POST', `/scripts/${id}/revision-requests`, 409, {
    reason: 'Tentativa após aprovação.', deadline_date: '2026-03-15',
  });
  assert.deepEqual(await request<ScriptView>('GET', `/scripts/${id}`, 200), view);
  writeFileSync(new URL('./fluxo.md', import.meta.url), `${lines.join('\n').trimEnd()}\n`);
  console.log(`${requests} chamadas HTTP verificadas; examples/fluxo.md atualizado.`);
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
}
