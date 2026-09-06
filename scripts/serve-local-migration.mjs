import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = readFileSync(join(root, 'supabase', 'migrations', '202609050001_production_messaging.sql'), 'utf8');

createServer((request, response) => {
  if (request.url !== '/migration') {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(`<textarea id="migration">${sql.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</textarea>`);
}).listen(8767, '127.0.0.1');
