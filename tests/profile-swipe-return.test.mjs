import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

function harness({ enabled = true, active = true, reduced = false, history = 1 } = {}) {
  const handlers = new Map(), values = new Map(), animations = [], documentRoot = { dataset: {} };
  let returns = 0, cleanup, modal = false, preparations = 0, restorations = 0, running;
  class Target {
    constructor({ header = false, control = false, handle = false, inline = false, scroll = 0 } = {}) {
      Object.assign(this, { header, control, handle, inline, scrollTop: scroll, parentElement: null });
    }
    closest(selector) {
      if (selector === '.profile-header-region') return this.header ? this : null;
      if (selector === '.profile-return-handle') return this.handle ? this : null;
      if (selector === '[data-inline-project-pages]') return this.inline ? this : null;
      return this.control ? this : null;
    }
  }
  const root = {
    setAttribute() {}, removeAttribute() {},
    style: { setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) },
    getBoundingClientRect: () => ({ top: 24 + (running?.offset ?? parseFloat(values.get('--profile-pull-offset') ?? '0')) }),
    addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name),
    animate(frames, options) {
      let resolve, reject;
      const offset = frame => Number(frame.transform.match(/, ([\d.]+)(?:px)?,/)[1]);
      const animation = {
        frames, options, offset: offset(frames[0]), canceled: 0,
        finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
        move(value) { if (running === this) this.offset = value; },
        finish() { if (running === this) this.offset = offset(frames.at(-1)); resolve(); },
        cancel() { this.canceled++; if (running === this) running = undefined; reject(Error('Canceled')); },
      };
      animations.push(animation); running = animation; return animation;
    },
  };
  const window = { scrollY: 0, innerHeight: 912, history: { state: { idx: history } } };
  const document = { documentElement: documentRoot, dispatchEvent() {}, querySelector: selector => selector === '[aria-modal="true"]' && modal ? {} : null };
  const pull = sourceModule('src/presentation/mobile/pullDismissMotion.ts', {
    '../motion/motion': { motionMs: scale => reduced ? 0 : scale === 'slow' ? 260 : 180, motionEase: () => 'linear' },
  }, { document, window, Event });
  const { useProfileSwipeReturn } = sourceModule('src/presentation/mobile/useProfileSwipeReturn.ts', {
    react: { useRef: current => ({ current }), useEffect: fn => { cleanup = fn(); } },
    './MobileBackNavigation': { useMobileScreenActive: () => active },
    './pullDismissMotion': {
      ...pull,
      preparePullSurface(surface) { preparations++; return { surface, restore() { restorations++; } }; },
    },
  }, { document, window, Element: Target });
  useProfileSwipeReturn({ current: root }, enabled, () => returns++);
  const begin = (options = {}, x = 0, y = 0) => handlers.get('touchstart')?.({ target: new Target(options), touches: [{ clientX: x, clientY: y }] });
  const move = (x = 0, y = 90, count = 1) => {
    let prevented = false;
    handlers.get('touchmove')?.({ touches: Array.from({ length: count }, () => ({ clientX: x, clientY: y })), cancelable: true, preventDefault() { prevented = true; } });
    return prevented;
  };
  const end = () => handlers.get('touchend')?.({ cancelable: true, preventDefault() {} });
  const swipe = (options = {}, x = 0, y = 90) => { begin(options); const prevented = move(x, y); end(); return prevented; };
  return {
    handlers, animations, begin, move, end, swipe, values, documentRoot,
    get returns() { return returns; }, get preparations() { return preparations; }, get restorations() { return restorations; },
    setModal: () => { modal = true; }, cancel: () => handlers.get('touchcancel')?.(), cleanup: () => cleanup?.(),
  };
}
const flush = async () => { for (let index = 0; index < 4; index++) await Promise.resolve(); };

test('profile pull claims overscroll and performs Back once when its exit finishes', async () => {
  const h = harness(); assert.equal(h.swipe(), true); assert.equal(h.returns, 0);
  h.end(); assert.equal(h.animations.length, 1);
  h.animations[0].finish(); await flush(); assert.equal(h.returns, 1);
  h.swipe(); h.end(); assert.equal(h.returns, 1); assert.equal(h.animations.length, 1);
  h.cleanup(); assert.equal(h.handlers.size, 0); assert.equal(h.restorations, 1);
});

test('profile handle remains eligible over scrolled content', async () => {
  const h = harness(); h.swipe({ header: true, control: true, handle: true, scroll: 120 });
  h.animations[0].finish(); await flush(); assert.equal(h.returns, 1); h.cleanup();
});

test('scrolling, controls, dialogs, unavailable history and disabled WEB/retained screens do not dismiss', () => {
  for (const options of [{ scroll: 10 }, { control: true }]) { const h = harness(); h.swipe(options); assert.equal(h.animations.length, 0); h.cleanup(); }
  const modal = harness(); modal.setModal(); modal.swipe(); assert.equal(modal.animations.length, 0); modal.cleanup();
  const root = harness({ history: 0 }); root.swipe(); assert.equal(root.animations.length, 0); root.cleanup();
  for (const options of [{ enabled: false }, { active: false }]) assert.equal(harness(options).handlers.size, 0);
});

test('horizontal and upward fresh pulls preserve scrolling; short pulls settle without Back', async () => {
  for (const [x, y] of [[50, 90], [0, -20]]) { const h = harness(); h.swipe({}, x, y); assert.equal(h.animations.length, 0); h.cleanup(); }
  const h = harness(); h.swipe({}, 0, 30); assert.equal(h.animations[0].options.duration, 180);
  h.animations[0].finish(); await flush(); assert.equal(h.returns, 0); assert.equal(h.restorations, 1); h.cleanup();
});

test('vertical gestures over inline project media never borrow the profile Back gesture', () => {
  const h = harness();
  assert.equal(h.swipe({ inline: true }), false);
  assert.equal(h.animations.length, 0); assert.equal(h.returns, 0); h.cleanup();
});

test('a new touch catches snap-back at its displayed position and keeps the same stage', async () => {
  const h = harness(); h.swipe({}, 0, 30); const old = h.animations[0]; old.move(20);
  h.begin({}, 0, 200); assert.equal(old.canceled, 1); assert.equal(h.values.get('--profile-pull-offset'), '20px');
  assert.equal(h.preparations, 1); assert.equal(h.restorations, 0); await flush();
  assert.equal(h.documentRoot.dataset.mobilePullDismiss, 'tracking');
  h.move(0, 190); assert.equal(h.values.get('--profile-pull-offset'), '10px'); h.end();
  assert.equal(h.animations[1].frames[0].transform, 'translate3d(0, 10px, 0)');
  h.animations[1].finish(); await flush(); assert.equal(h.returns, 0); assert.equal(h.restorations, 1);
  assert.equal(h.documentRoot.dataset.mobilePullDismiss, undefined); h.cleanup();
});

test('a new touch can reverse pending dismissal without allowing its old Back callback', async () => {
  const h = harness(); h.swipe(); const old = h.animations[0]; old.move(120);
  h.begin({}, 0, 200); h.move(0, 100); h.end(); old.finish(); await flush();
  assert.equal(h.animations[1].frames[0].transform, 'translate3d(0, 20px, 0)'); assert.equal(h.returns, 0);
  h.animations[1].finish(); await flush(); assert.equal(h.restorations, 1); assert.equal(h.returns, 0); h.cleanup();
});

test('catching a late exit beyond the fresh-pull limit does not jump back to 65 percent', async () => {
  const h = harness(); h.swipe(); h.animations[0].move(700);
  h.begin({}, 0, 700); assert.equal(h.values.get('--profile-pull-offset'), '700px');
  h.move(0, 710); assert.equal(h.values.get('--profile-pull-offset'), '700px');
  h.move(0, 50); assert.equal(h.values.get('--profile-pull-offset'), '50px'); h.end();
  h.animations[1].finish(); await flush(); assert.equal(h.returns, 0); h.cleanup();
});

test('a fulfilled exit whose callback is queued cannot commit after a new touch takes over', async () => {
  const h = harness(); h.swipe(); h.animations[0].finish();
  h.begin({}, 0, 912); h.move(0, 12); h.end(); await flush();
  assert.equal(h.returns, 0); assert.equal(h.restorations, 0);
  h.animations[1].finish(); await flush(); assert.equal(h.returns, 0); assert.equal(h.restorations, 1); h.cleanup();
});

test('a queued snap-back completion cannot tear down a renewed pull', async () => {
  const h = harness(); h.swipe({}, 0, 30); h.animations[0].finish();
  h.begin({}, 0, 100); h.move(0, 190); h.end(); await flush();
  assert.equal(h.preparations, 1); assert.equal(h.restorations, 0); assert.equal(h.returns, 0);
  h.animations[1].finish(); await flush(); assert.equal(h.returns, 1); h.cleanup();
});

test('re-grab and renewed dismissal still commit Back only once', async () => {
  const h = harness(); h.swipe(); const old = h.animations[0]; old.move(100);
  h.begin({}, 0, 200); h.move(0, 230); h.end(); h.end(); old.finish(); await flush();
  assert.equal(h.returns, 0); assert.equal(h.animations.length, 2);
  h.animations[1].finish(); await flush(); assert.equal(h.returns, 1); h.swipe(); assert.equal(h.animations.length, 2); h.cleanup();
});

test('an excluded control does not interrupt pending dismissal', async () => {
  const h = harness(); h.swipe(); h.animations[0].move(110); h.begin({ control: true });
  assert.equal(h.animations[0].canceled, 0); h.animations[0].finish(); await flush(); assert.equal(h.returns, 1); h.cleanup();
});

test('touch cancellation and unmount clean pending motion and suppress Back', async () => {
  for (const dispose of [h => h.cancel(), h => h.cleanup()]) {
    const h = harness(); h.swipe(); dispose(h); h.animations[0].finish(); await flush();
    assert.equal(h.returns, 0); assert.equal(h.restorations, 1); assert.equal(h.documentRoot.dataset.mobilePullDismiss, undefined);
    assert.equal(h.values.has('--profile-pull-offset'), false); h.cleanup();
  }
});

test('a second finger releases a caught frame instead of committing dismissal', async () => {
  const h = harness(); h.swipe(); h.animations[0].move(100);
  h.begin({}, 0, 200); h.move(0, 210, 2); h.end(); await flush();
  assert.equal(h.returns, 0); assert.equal(h.animations.length, 1); assert.equal(h.restorations, 1); h.cleanup();
});

test('reduced motion performs Back immediately and restores short pulls immediately', () => {
  const h = harness({ reduced: true }); h.swipe(); assert.equal(h.returns, 1); assert.equal(h.animations.length, 0); h.cleanup();
  const short = harness({ reduced: true }); short.swipe({}, 0, 30); assert.equal(short.returns, 0); assert.equal(short.restorations, 1); assert.equal(short.animations.length, 0); short.cleanup();
});
