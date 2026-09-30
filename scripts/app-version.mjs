import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

/** Content version works in both Git checkouts and the Sites source archive. No env/credentials. */
export function appVersionHash(root = process.cwd()) {
  const hash = createHash('sha256');
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = resolve(path, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) hash.update(relative(root, file).replaceAll('\\', '/')).update('\0').update(readFileSync(file)).update('\0');
    }
  }
  visit(resolve(root, 'src'));
  for (const name of ['index.html', 'share.html', 'package-lock.json', 'vite.config.ts', 'scripts/shared-profile-preload.mjs', 'scripts/app-version.mjs']) {
    hash.update(name).update('\0').update(readFileSync(resolve(root, name))).update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}
