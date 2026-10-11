import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { openDatabase } from './database.js';
import { ReviewService } from './review.js';

const path = resolve(process.env.DB_PATH ?? 'data/review.sqlite');
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT inválida.');
mkdirSync(dirname(path), { recursive: true });
const db = openDatabase(path);
const app = createApp(new ReviewService(db));
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
  console.log(`API em http://127.0.0.1:${info.port}; SQLite: ${path}`);
});
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(() => db.close());
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
