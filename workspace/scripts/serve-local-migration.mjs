import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationName = process.argv[2] ?? '202609050001_production_messaging.sql';
if (!/^\d+_[a-z_]+\.sql$/.test(migrationName)) throw new Error('Pass a migration filename from supabase/migrations.');
const sql = readFileSync(join(root, 'supabase', 'migrations', migrationName), 'utf8');

createServer((request, response) => {
  if (request.url !== '/migration') {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(`<textarea id="migration">${sql.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</textarea>`);
}).listen(8767, '127.0.0.1');
