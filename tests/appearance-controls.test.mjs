import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/data/navButtonTokens.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { systemGrays, navAccents, resolveNavButtonTokens: resolve } = exports;

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((byte) => Number.parseInt(byte, 16) / 255);
  const linear = rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(a, b) {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}

test('every saved gray keeps readable control labels through hover, press and selection', () => {
  for (const theme of ['light', 'dark']) {
    for (const gray of systemGrays) {
      for (const highContrast of [false, true]) {
        for (const opaque of [false, true]) {
          const tokens = resolve(theme, '#ff375f', highContrast, opaque, gray.id);
          assert.equal(tokens['--control-rest-surface'], gray[theme], 'the saved gray must remain available');
          for (const [surface, ink] of [
            ['--control-rest-surface', '--control-text'],
            ['--control-hover-surface', '--control-hover-text'],
            ['--control-pressed-surface', '--control-pressed-text'],
            ['--control-selected-surface', '--control-selected-text'],
          ]) {
            assert.ok(contrast(tokens[surface], tokens[ink]) >= 4.5,
              `${theme}/${gray.id}/${highContrast}: ${surface} needs readable ink`);
          }
          assert.equal(tokens['--nav-button-focus-ring'], 'var(--focus-ring)');
        }
      }
    }
  }
});

test('neutral hover follows a neighboring gray across the light/dark boundary', () => {
  const tokens = resolve('dark', '#007aff', false, false, 'gray2');
  assert.equal(tokens['--control-hover-surface'], '#8E8E93');
  assert.notEqual(tokens['--control-text'], tokens['--control-hover-text']);
  assert.equal(tokens['--nav-button-text-selected'], 'var(--accent-text)');
});

test('selected controls retain their chosen neutral gray on any host canvas', () => {
  for (const theme of ['light', 'dark']) for (const gray of systemGrays) {
    for (const highContrast of [false, true]) for (const opaque of [false, true]) {
      let selectedSurface;
      for (const accent of navAccents.map(value => value[theme])) {
        const tokens = resolve(theme, accent, highContrast, opaque, gray.id);
        const surface = tokens['--control-selected-surface'];
        assert.match(surface, /^#[\da-f]{6}$/i, 'Selection must not disappear by compositing a translucent white overlay onto a white canvas.');
        assert.notEqual(surface.toLowerCase(), gray[theme].toLowerCase(), 'Selection must remain distinct from its resting gray.');
        selectedSurface ??= surface;
        assert.equal(surface, selectedSurface, 'The accent colors the ink, not the neutral selection surface.');
        for (const backdrop of ['#FFFFFF', '#000000', gray[theme]]) {
          assert.equal(composite(surface, backdrop), surface, 'Selection must not depend on its parent surface.');
          assert.ok(contrast(composite(surface, backdrop), tokens['--control-selected-text']) >= 4.5,
            `${theme}/${gray.id}/${accent}: selected labels must remain readable`);
        }
      }
    }
  }
  const lightGray = resolve('light', '#FF375F', false, false, 'gray');
  assert.equal(lightGray['--control-selected-surface'], '#808084');
  assert.equal(resolve('dark', '#FF375F', false, false, 'gray6')['--control-selected-surface'], '#333335');
  assert.equal(lightGray['--nav-button-background-selected'], 'rgba(255,255,255,0.14)', 'Legacy navigation tokens are unchanged.');
  assert.equal(lightGray['--nav-button-text-selected'], 'var(--accent-text)');
  assert.equal(lightGray['--nav-button-icon-selected'], 'var(--accent-text)');
});

function composite(color, backdrop) {
  if (color.startsWith('#')) return color;
  const parts = color.match(/^rgba\((.+)\)$/)?.[1].split(',').map(Number);
  assert.equal(parts?.length, 4, `Unexpected material: ${color}`);
  const rgb = backdrop.slice(1).match(/../g).map((byte) => Number.parseInt(byte, 16));
  return `#${rgb.map((channel, index) => Math.round(channel * (1 - parts[3]) + parts[index] * parts[3]).toString(16).padStart(2, '0')).join('')}`;
}

test('navigation state ink stays readable through every gray over both material extremes', () => {
  for (const theme of ['light', 'dark']) for (const gray of systemGrays) {
    for (const highContrast of [false, true]) for (const opaque of [false, true]) {
      const tokens = resolve(theme, '#ff375f', highContrast, opaque, gray.id);
      assert.equal(tokens['--navigation-foreground'], tokens['--control-text']);
      for (const [surface, ink] of [
        ['--navigation-surface', '--navigation-foreground'],
        ['--navigation-hover-surface', '--navigation-hover-foreground'],
        ['--navigation-pressed-surface', '--navigation-pressed-foreground'],
        ['--navigation-selected-surface', '--navigation-selected-foreground'],
      ]) for (const backdrop of ['#000000', '#FFFFFF']) {
        assert.ok(contrast(composite(tokens[surface], backdrop), tokens[ink]) >= 4.5,
          `${theme}/${gray.id}/${highContrast}/${opaque}: ${surface} on ${backdrop}`);
      }
      const material = tokens['--navigation-surface'];
      if (opaque) {
        assert.equal(material, gray[theme]);
        assert.equal(tokens['--navigation-blur'], 'none');
        for (const key of ['--navigation-hover-surface', '--navigation-pressed-surface', '--navigation-selected-surface']) assert.match(tokens[key], /^#[\da-f]{6}$/i);
      } else {
        assert.match(material, /, 0\.92\)$/);
        assert.equal(tokens['--navigation-blur'], 'blur(22px) saturate(140%)');
      }
      assert.equal(tokens['--navigation-border'], tokens['--control-border']);
      assert.match(tokens['--navigation-shadow'], /^0 4px 16px .*inset 0 0 0 1px /);
    }
  }
});

test('every accent is contrast-corrected on the actual navigation gray and selected fill', () => {
  for (const theme of ['light', 'dark']) for (const gray of systemGrays) {
    for (const highContrast of [false, true]) for (const opaque of [false, true]) {
      const accents = [...navAccents.map((value) => value[theme]), '#000000', '#FFFFFF', '#000', '#fff', 'rgb(255, 255, 0)', 'invalid-color'];
      let selectedSurface;
      for (const accent of accents) {
        const tokens = resolve(theme, accent, highContrast, opaque, gray.id);
        selectedSurface ??= tokens['--navigation-selected-surface'];
        assert.equal(tokens['--navigation-selected-surface'], selectedSurface, 'selection remains neutral for every accent');
        const ink = tokens['--navigation-selected-foreground'];
        for (const surface of [tokens['--navigation-selected-surface'], ...['#000000', '#FFFFFF'].map((background) => composite(tokens['--navigation-surface'], background))]) {
          assert.ok(contrast(ink, surface) >= 4.5, `${theme}/${gray.id}/${accent}: accent ${ink} on ${surface}`);
        }
        assert.equal(tokens['--navigation-focus-ring'], ink);
      }
    }
  }
});

test('selected navigation uses the visibly raised/deepened neutral project capsule fill', () => {
  for (const theme of ['light', 'dark']) for (const gray of systemGrays) {
    const tokens = resolve(theme, '#FF375F', false, false, gray.id);
    const target = theme === 'dark' ? 255 : 0;
    const expected = `#${gray[theme].slice(1).match(/../g).map((byte) => {
      const channel = Number.parseInt(byte, 16);
      return Math.round(channel + (target - channel) * .1).toString(16).padStart(2, '0');
    }).join('').toUpperCase()}`;
    assert.equal(tokens['--navigation-selected-surface'], expected);
    assert.notEqual(expected, gray[theme]);
  }
  assert.equal(resolve('dark', '#FF375F', false, false, 'gray6')['--navigation-selected-surface'], '#333335');
});

test('navigation defaults preserve legacy tokens and resting controls while selected controls stay readable', () => {
  for (const theme of ['light', 'dark']) for (const highContrast of [false, true]) for (const opaque of [false, true]) {
    const tokens = resolve(theme, '#007AFF', highContrast, opaque);
    assert.match(tokens['--control-selected-surface'], /^#[\da-f]{6}$/i);
    assert.ok(contrast(tokens['--control-selected-surface'], tokens['--control-selected-text']) >= 4.5);
    assert.equal(tokens['--nav-button-text-selected'], 'var(--accent-text)');
    assert.equal(tokens['--nav-button-focus-ring'], 'var(--focus-ring)');
    assert.equal(tokens['--control-rest-surface'], theme === 'dark' ? opaque ? '#1B1C1C' : 'rgba(27,28,28,0.85)' : opaque ? '#F3F3F6' : 'rgba(24,24,27,0.035)');
    for (const background of ['#000000', '#FFFFFF']) assert.ok(contrast(tokens['--navigation-foreground'], composite(tokens['--navigation-surface'], background)) >= 4.5);
    assert.equal(tokens['--navigation-blur'], opaque ? 'none' : 'blur(22px) saturate(140%)');
  }
});

test('High Contrast strengthens navigation ink and edges without changing the transparency choice', () => {
  for (const theme of ['light', 'dark']) for (const gray of [undefined, ...systemGrays.map(value => value.id)]) {
    for (const reduced of [false, true]) {
      const ordinary = resolve(theme, '#007AFF', false, reduced, gray);
      const highContrast = resolve(theme, '#007AFF', true, reduced, gray);
      for (const key of ['--navigation-surface', '--navigation-hover-surface', '--navigation-pressed-surface', '--navigation-selected-surface', '--navigation-blur']) {
        assert.equal(highContrast[key], ordinary[key], `${theme}/${gray}/${reduced}: contrast must not change ${key}`);
      }
      for (const backdrop of ['#000000', '#FFFFFF']) {
        const surface = composite(highContrast['--navigation-surface'], backdrop);
        assert.ok(contrast(highContrast['--navigation-foreground'], surface) >= contrast(ordinary['--navigation-foreground'], surface),
          `${theme}/${gray}/${reduced}: contrast must retain or improve foreground legibility`);
        assert.ok(contrast(composite(highContrast['--navigation-border'], surface), surface)
          >= contrast(composite(ordinary['--navigation-border'], surface), surface),
        `${theme}/${gray}/${reduced}: contrast must strengthen the edge rather than flatten its material`);
      }
      if (!reduced) {
        assert.match(highContrast['--navigation-surface'], /, 0\.92\)$/);
        assert.notEqual(highContrast['--navigation-blur'], 'none');
      } else {
        assert.equal(highContrast['--navigation-blur'], 'none');
        assert.match(highContrast['--navigation-surface'], /^#[\da-f]{6}$/i);
      }
    }
  }
});
