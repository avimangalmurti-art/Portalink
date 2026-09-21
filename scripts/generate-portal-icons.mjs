// Rebuild the local icon library from the installed, pinned Lucide package.
// No network, database, or deployment access. Commit the generated files.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { Buffer } from 'node:buffer';

const root = new URL('../', import.meta.url);
const pkg = new URL('node_modules/lucide-react/', root);
const { version } = JSON.parse(await readFile(new URL('package.json', pkg), 'utf8'));
const license = await readFile(new URL('LICENSE', pkg), 'utf8');
const folder = new URL('dist/esm/icons/', pkg);
const names = [], symbols = [];
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
for (const file of (await readdir(folder)).filter(file => file.endsWith('.js')).sort()) {
  const source = await readFile(new URL(file, folder), 'utf8');
  // Alias modules re-export another icon and should not duplicate the catalog.
  if (!source.includes('const __iconNode =')) continue;
  const { __iconNode: nodes } = await import(new URL(file, folder).href);
  const name = file.slice(0, -3);
  const body = nodes.map(([tag, attributes]) => {
    if (!['path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon'].includes(tag)) throw new Error(`Unexpected SVG element: ${tag}`);
    const attrs = Object.entries(attributes).filter(([key]) => key !== 'key').map(([key, value]) => {
      if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(key) || /^on/i.test(key) || /href/i.test(key)) throw new Error(`Unexpected SVG attribute: ${key}`);
      return `${key}="${escape(value)}"`;
    }).join(' ');
    return `<${tag} ${attrs}/>`;
  }).join('');
  names.push(name);
  symbols.push(`<symbol id="${name}" viewBox="0 0 24 24">${body}</symbol>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg"><!-- Lucide ${version}; license: /icons/LICENSE-lucide.txt -->\n${symbols.join('\n')}\n</svg>\n`;
const hash = createHash('sha256').update(svg).digest('hex').slice(0, 12);
const catalog = JSON.stringify({ version, sprite: `/icons/lucide-${version}.svg?v=${hash}`, names }, null, 2) + '\n';
const files = [
  [`public/icons/lucide-${version}.svg`, svg],
  ['public/icons/LICENSE-lucide.txt', license],
  ['src/data/portal-icon-catalog.json', catalog],
];
for (const [path, content] of files) {
  const target = new URL(path, root);
  if (process.argv.includes('--check')) {
    if (await readFile(target, 'utf8') !== content) throw new Error(`Regenerate ${path}`);
  } else {
    await mkdir(new URL('./', target), { recursive: true });
    await writeFile(target, content);
  }
}
console.log(`${names.length} Lucide icons ${process.argv.includes('--check') ? 'verified' : 'generated'} (${Math.round(Buffer.byteLength(svg) / 1024)} KB SVG).`);
