const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = readFileSync(join(__dirname, 'game.js'), 'utf8');
const Arena = vm.runInNewContext(readFileSync(join(__dirname, 'arena.js'), 'utf8') + '\nArena');

function loadGame(storage) {
  const elements = new Map();
  const parameter = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const contexts = [];
  let frame;

  class AudioContext {
    state = 'suspended';
    tones = [];
    constructor() { contexts.push(this); }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    createGain() { return { gain: parameter(), connect() {} }; }
    createOscillator() {
      const tone = {
        frequency: parameter(), connect: node => node, start() {},
        stop(time) { if (time === undefined) this.cutOff = true; },
      };
      this.tones.push(tone);
      return tone;
    }
  }

  function element() {
    const node = () => ({});
    return Object.assign(new EventTarget(), {
      firstChild: node(), lastChild: node(), lastElementChild: node(), style: {},
      classList: { toggle() {} }, attributes: {},
      getContext() {}, focus() {}, replaceChildren() {},
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
      querySelectorAll: () => [], querySelector: node,
      setAttribute(name, value) { this.attributes[name] = String(value); },
    });
  }

  const document = Object.assign(new EventTarget(), {
    hidden: false, documentElement: element(), createElement: element,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
  });
  const window = Object.assign(new EventTarget(), { AudioContext });
  vm.runInNewContext(source, {
    window, document, AudioContext,
    Arena: { ...Arena, step: game => game.events.push('shot0') },
    Visual: { renderer: () => () => {} },
    localStorage: storage,
    matchMedia: () => ({ matches: false }),
    screen: {}, performance: { now: () => 0 },
    ResizeObserver: class { observe() {} },
    requestAnimationFrame: next => { frame = next; },
  });
  const click = id => elements.get(id).dispatchEvent(new Event('click'));
  return { click, elements, contexts, document, frame: () => frame(17) };
}

test('sound preference and label survive a reload in both directions', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const first = loadGame(storage);
  first.click('sound');
  const second = loadGame(storage);
  const sound = second.elements.get('sound');
  assert.equal(sound.lastElementChild.textContent, '音效关闭');
  assert.equal(sound.attributes['aria-pressed'], 'true');
  second.click('action');
  second.frame();
  assert.equal(second.contexts.length, 0);
  second.click('sound');
  assert.equal(second.contexts[0].state, 'running');
  second.frame();
  assert.equal(second.contexts[0].tones.length, 1);
  const third = loadGame(storage);
  assert.equal(third.elements.get('sound').lastElementChild.textContent, '音效开启');
  assert.equal(third.elements.get('sound').attributes['aria-pressed'], 'false');
});

test('active sounds stop on pause or tab hide and only resume with play', () => {
  const app = loadGame({
    getItem() { throw Error('Storage unavailable'); },
    setItem() { throw Error('Storage unavailable'); },
  });
  app.click('action');
  app.frame();
  const [audio] = app.contexts;
  app.click('pause');
  assert.equal(audio.state, 'suspended');
  assert.equal(audio.tones[0].cutOff, true);
  app.click('pause');
  assert.equal(audio.state, 'running');
  app.frame();
  app.document.hidden = true;
  app.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(audio.state, 'suspended');
  assert.equal(audio.tones[1].cutOff, true);
  assert.equal(app.elements.get('overlay').hidden, false);
  app.document.hidden = false;
  app.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(audio.state, 'suspended');
  app.click('action');
  assert.equal(audio.state, 'running');
  app.frame();
  app.click('sound');
  assert.equal(audio.tones[2].cutOff, true);
  assert.equal(app.elements.get('sound').lastElementChild.textContent, '音效关闭');
});
