import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { sourceModule } from './helpers/source-module.mjs';

const origin = 'https://portalinknetworks.com';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function shellConfig(env = {}) {
  let retryScript;
  const { default: config } = sourceModule('capacitor.config.ts', {
    'node:fs': { writeFileSync(path, value) {
      assert.equal(path, 'native/shell/server-url.js');
      retryScript = value;
    } },
  }, { process: { env } });
  return { config, retryScript };
}

function retryDestination(retryScript) {
  let click;
  const sandbox = { window: {}, location: {}, document: {
    getElementById(id) {
      assert.equal(id, 'retry');
      return { addEventListener(type, listener) { assert.equal(type, 'click'); click = listener; } };
    },
  } };
  const context = vm.createContext(sandbox);
  if (retryScript) vm.runInContext(retryScript, context);
  const [, script] = read('native/shell/index.html').match(/<script>([\s\S]*?)<\/script>/);
  vm.runInContext(script, context);
  click();
  return sandbox.location.href;
}

test('iOS launch, app-bound navigation and offline retry use the canonical Portalink host', () => {
  const { config, retryScript } = shellConfig();
  const [, boundDomains] = read('ios/App/App/Info.plist').match(/<key>WKAppBoundDomains<\/key>\s*<array>([\s\S]*?)<\/array>/);
  const hosts = Array.from(boundDomains.matchAll(/<string>([^<]+)<\/string>/g), match => match[1]);
  assert.equal(config.server.url, origin);
  assert.equal(config.server.cleartext, false);
  assert.equal(config.ios.limitsNavigationsToAppBoundDomains, true);
  assert.deepEqual(hosts, [new URL(config.server.url).hostname]);
  assert.equal(retryDestination(retryScript), origin);
  assert.equal(retryDestination(), `${origin}/`);
});

test('iOS development overrides still use the development origin for launch and retry', () => {
  const devUrl = 'http://localhost:5173';
  const { config, retryScript } = shellConfig({ CAP_SERVER_URL: ` ${devUrl} ` });
  assert.equal(config.server.url, devUrl);
  assert.equal(config.server.cleartext, true);
  assert.equal(config.ios.limitsNavigationsToAppBoundDomains, false);
  assert.equal(retryDestination(retryScript), devUrl);
});
