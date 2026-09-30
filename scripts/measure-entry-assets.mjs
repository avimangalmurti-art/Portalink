import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

/** Emitted static module graph only. Dynamic imports are intentionally excluded. */
export function measureEntry(directory, htmlName) {
  const root = resolve(directory), html = readFileSync(resolve(root, htmlName), 'utf8');
  const scripts = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+\.js)"[^>]*>/g)].map(match => match[1]);
  const css = new Set([...html.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)].map(match => match[1]));
  const seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    source.statements.forEach(node => {
      if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return;
      const specifier = node.moduleSpecifier.text;
      if (specifier.startsWith('.')) visit(resolve(dirname(file), specifier));
    });
  };
  scripts.forEach(file => visit(resolve(root, file.replace(/^\//, ''))));
  const describe = file => ({ file: relative(root, file).replaceAll('\\', '/'), bytes: statSync(file).size, gzipBytes: gzipSync(readFileSync(file)).length });
  const js = [...seen].sort().map(describe), styles = [...css].sort().map(file => describe(resolve(root, file.replace(/^\//, ''))));
  return { entry: htmlName, jsBytes: js.reduce((sum, item) => sum + item.bytes, 0), jsGzipBytes: js.reduce((sum, item) => sum + item.gzipBytes, 0), cssBytes: styles.reduce((sum, item) => sum + item.bytes, 0), cssGzipBytes: styles.reduce((sum, item) => sum + item.gzipBytes, 0), js, css: styles };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = process.argv[2] ?? 'dist/client';
  console.log(JSON.stringify(['index.html', 'share.html'].filter(file => existsSync(resolve(directory, file))).map(file => measureEntry(directory, file)), null, 2));
}
