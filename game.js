'use strict';

(() => {
  const byId = id => document.getElementById(id);
  const ui = Object.fromEntries([
    'field', 'stage', 'life', 'life-label', 'hp', 'life-bar', 'gun', 'reload-status', 'ammo', 'wave', 'score', 'best', 'notice', 'overlay',
    'eyebrow', 'heading', 'subtitle', 'result', 'final-score', 'final-best', 'final-time', 'action', 'hint',
    'sound', 'pause', 'touch-actions', 'touch-gun', 'touch-reload', 'loadout',
  ].map(id => [id, byId(id)]));
  const arms = Array.from(ui.loadout.querySelectorAll('button'));
  const context = ui.field.getContext('2d');
  const render = Visual.renderer(context);
  const coarse = matchMedia('(pointer: coarse)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const keys = new Set();
  const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
  const touches = { move: null, aim: null };
  const audio = createAudio();
  const recordKey = 'qiangzhan-neon-best-v1';
  let state = 'ready';
  let game = Arena.create(1000, 540, loadBest());
  let mouse = null;
  let isFiring = false;
  let queuedShot = false;
  let touchMode = coarse.matches;
  let last = performance.now();
  let uiSnapshot = '';

  function loadBest() {
    try {
      const n = Number(localStorage.getItem(recordKey));
      return Number.isSafeInteger(n) && n >= 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  function saveBest() {
    try {
      localStorage.setItem(recordKey, String(game.best));
    } catch {
      // 浏览器禁用本地存储时，纪录仍会保留到本页关闭。
    }
  }

  function fit() {
    const box = ui.field.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 3840 / box.width, 2160 / box.height);
    const scale = Math.max(.68, box.width / 1160, box.height / 625);
    Arena.resize(game, box.width / scale, box.height / scale);
    const width = Math.round(box.width * ratio);
    const height = Math.round(box.height * ratio);
    if (ui.field.width === width && ui.field.height === height) return;
    ui.field.width = width;
    ui.field.height = height;
    context.setTransform(width / game.w, 0, 0, height / game.h, 0, 0);
    clearInput();
  }

  function clearInput() {
    keys.clear();
    mouse = null;
    isFiring = queuedShot = false;
    const activeTouches = [touches.move, touches.aim];
    touches.move = touches.aim = null;
    for (const touch of activeTouches) {
      if (touch && ui.field.hasPointerCapture(touch.id)) ui.field.releasePointerCapture(touch.id);
    }
  }

  function syncTouchUi() {
    document.documentElement.classList.toggle('touch-mode', touchMode);
    ui['touch-actions'].hidden = state !== 'play' || !touchMode;
  }

  function setTouchMode(enabled) {
    if (touchMode === enabled) return;
    touchMode = enabled;
    syncTouchUi();
    fit();
  }

  function pauseForTouchLayout() {
    if (touchMode && state === 'play') change('paused', false);
  }

  function updateHud() {
    const p = game.player;
    const ammo = game.arsenal[p.slot];
    const unlocked = game.arsenal.map(item => item.unlocked).join(',');
    const countdown = game.nextWave === null ? '' :
      (game.wave ? '休整 · 下一波 ' : '战斗准备 · ') + Math.ceil(game.nextWave) + ' 秒';
    const notice = game.noticeTime > 0 ? game.notice : countdown;
    const signature = [state, p.hp, p.slot, ammo.clip, ammo.reserve, !!ammo.reload, game.wave, game.score, game.best, unlocked, notice].join('|');
    if (signature === uiSnapshot) return;
    uiSnapshot = signature;
    ui.life.classList.toggle('critical', p.hp <= 25);
    ui['life-label'].textContent = p.hp > 0 && p.hp <= 25 ? '生命警报' : '生命值';
    ui.hp.textContent = p.hp;
    ui['life-bar'].style.width = p.hp + '%';
    ui.gun.textContent = Arena.guns[p.slot].name;
    ui['reload-status'].hidden = !ammo.reload;
    const reserve = document.createElement('span');
    reserve.textContent = ' / ' + (ammo.reserve === Infinity ? '∞' : ammo.reserve);
    ui.ammo.replaceChildren(ammo.clip, reserve);
    ui.wave.textContent = Arena.readout(Math.max(1, game.wave), 2);
    ui.score.textContent = Arena.readout(game.score);
    ui.best.textContent = Arena.readout(game.best);
    ui.notice.textContent = notice;
    ui.notice.hidden = !notice || state !== 'play';
    arms.forEach((button, i) => {
      button.disabled = !game.arsenal[i].unlocked || state !== 'play';
      button.setAttribute('aria-pressed', p.slot === i);
      button.title = Arena.guns[i].name + (game.arsenal[i].unlocked ? '' : ' · 未解锁');
    });
  }

  function change(next, focus = true) {
    state = next;
    if (next === 'play' && !document.hidden) audio.init();
    else if (next === 'paused') audio.stop();
    clearInput();
    ui.stage.classList.toggle('playing', next === 'play');
    document.documentElement.classList.toggle('in-battle', next === 'play');
    ui.overlay.hidden = next === 'play';
    ui.pause.disabled = next === 'ready' || next === 'over';
    ui.pause.lastElementChild.textContent = next === 'paused' ? '继续' : '暂停';
    syncTouchUi();
    if (next !== 'play') {
      const [mode, first, second, sub, action] = {
        ready: ['生存模式 · 涂鸦作战', '纸上', '突围', '一张纸，一道防线。守住阵地，撑过下一波。', '开始战斗'],
        paused: ['系统待命', '战斗', '暂停', '战场已冻结，随时可以继续。', '继续战斗'],
        over: [game.newRecord ? '新纪录' : '本轮结束', '防线', '失守',
          '你撑到了第 ' + game.wave + ' 波。' + (game.newRecord ? '最高纪录刷新。' : '再试一次，刷新纪录。'), '再战一局'],
      }[next];
      ui.eyebrow.querySelector('span').textContent = mode;
      ui.heading.firstChild.nodeValue = first;
      ui.heading.lastElementChild.textContent = second;
      ui.subtitle.textContent = sub;
      ui.action.firstChild.nodeValue = action + ' ';
      ui.hint.lastChild.nodeValue = next === 'ready' ? ' 快速开始' : next === 'paused' ? ' 继续战斗' : ' 再战一局';
      ui.result.hidden = next !== 'over';
      ui['final-score'].textContent = Arena.readout(game.score);
      ui['final-best'].textContent = Arena.readout(game.best);
      ui['final-time'].textContent = Arena.duration(game.elapsed);
      if (focus) ui.action.focus({ preventScroll: true });
    }
    updateHud();
  }

  function action() {
    if (state === 'paused') {
      change('play');
    } else if (state === 'ready' || state === 'over') {
      game = Arena.create(game.w, game.h, game.best);
      change('play');
    }
  }

  function togglePause() {
    if (state === 'play') change('paused');
    else if (state === 'paused') action();
  }

  function cycleGun() {
    if (state !== 'play') return;
    for (let i = 1; i < game.arsenal.length; i++) {
      const slot = (game.player.slot + i) % game.arsenal.length;
      if (game.arsenal[slot].unlocked) {
        Arena.switchGun(game, slot);
        return;
      }
    }
    Arena.switchGun(game, game.arsenal.findIndex(ammo => !ammo.unlocked));
  }

  function bindTouchAction(button, run) {
    button.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      run();
    });
    button.addEventListener('click', e => {
      if (e.detail === 0) run();
    });
  }

  function point(e) {
    const box = ui.field.getBoundingClientRect();
    return { x: (e.clientX - box.left) * game.w / box.width, y: (e.clientY - box.top) * game.h / box.height };
  }

  function readInput() {
    const pressed = (first, second) => Number(keys.has(first) || keys.has(second));
    let x = pressed('KeyD', 'ArrowRight') - pressed('KeyA', 'ArrowLeft');
    let y = pressed('KeyS', 'ArrowDown') - pressed('KeyW', 'ArrowUp');
    const move = touches.move;
    if (move) {
      const dx = move.x - move.ox;
      const dy = move.y - move.oy;
      const length = Math.max(34, Math.hypot(dx, dy));
      x = dx / length;
      y = dy / length;
    }
    const aim = touches.aim;
    if (aim) {
      const dx = aim.x - aim.ox;
      const dy = aim.y - aim.oy;
      if (Math.hypot(dx, dy) > 8) return { x, y, angle: Math.atan2(dy, dx), fire: true };
    }
    const fire = isFiring || queuedShot;
    queuedShot = false;
    return { x, y, aim: mouse, fire };
  }

  function frame(now) {
    const dt = Math.min(.04, (now - last) / 1000);
    last = now;
    if (state === 'play') {
      const best = game.best;
      Arena.step(game, readInput(), dt);
      for (const name of game.events.splice(0)) audio.play(name);
      if (game.best > best) saveBest();
      if (game.player.hp <= 0) {
        audio.play('over');
        change('over');
      } else {
        updateHud();
      }
    } else if (state === 'over') {
      Arena.step(game, {}, dt);
    }
    render(game, {
      time: state === 'ready' ? now / 1000 : game.elapsed,
      demo: state === 'ready',
      reduced: reduced.matches,
      aim: state === 'play' && !touchMode ? mouse : null,
      touches: state === 'play' && touchMode ? touches : null,
    });
    requestAnimationFrame(frame);
  }

  function createAudio() {
    const preferenceKey = 'qiangzhan-muted-v1';
    const sounds = {
      shot0: [258, 83, .085, 'triangle', .12],
      shot1: [138, 32, .16, 'sawtooth', .15],
      shot2: [395, 112, .06, 'triangle', .095],
      hurt: [108, 41, .19, 'square', .07],
      kill: [186, 462, .085, 'triangle', .095],
      pickup: [372, 840, .18, 'sine', .14],
      reload: [195, 116, .09, 'square', .036],
      loaded: [445, 510, .065, 'triangle', .095],
      switch: [280, 390, .07, 'triangle', .06],
      dry: [94, 80, .043, 'square', .04],
      wave: [290, 585, .31, 'sine', .12],
      alarm: [210, 102, .47, 'triangle', .13],
      over: [246, 55, .63, 'triangle', .15],
    };
    let ac;
    let master;
    const tones = new Set();
    let muted = false;
    try {
      muted = localStorage.getItem(preferenceKey) === 'true';
    } catch {}
    function init() {
      if (muted || !window.AudioContext) return;
      if (!ac) {
        ac = new AudioContext();
        master = ac.createGain();
        master.gain.value = .56;
        master.connect(ac.destination);
      }
      ac.resume().catch(() => {});
    }
    function toggle() {
      muted = !muted;
      try {
        localStorage.setItem(preferenceKey, String(muted));
      } catch {}
      if (muted) stop();
    }
    function stop() {
      if (!ac) return;
      for (const tone of tones) tone.stop();
      tones.clear();
      ac.suspend().catch(() => {});
    }
    function play(name) {
      if (!ac || muted || ac.state !== 'running' || !sounds[name]) return;
      const [from, to, duration, wave, volume] = sounds[name];
      const t = ac.currentTime;
      const tone = ac.createOscillator();
      const gain = ac.createGain();
      tone.type = wave;
      tone.frequency.setValueAtTime(from, t);
      tone.frequency.exponentialRampToValueAtTime(to, t + duration * .8);
      gain.gain.setValueAtTime(.001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + .009);
      gain.gain.exponentialRampToValueAtTime(.001, t + duration);
      tone.connect(gain).connect(master);
      tones.add(tone);
      tone.onended = () => tones.delete(tone);
      tone.start(t);
      tone.stop(t + duration + .01);
    }
    return { get muted() { return muted; }, init, toggle, play, stop };
  }

  function syncSoundButton() {
    ui.sound.setAttribute('aria-pressed', audio.muted);
    ui.sound.lastElementChild.textContent = audio.muted ? '音效关闭' : '音效开启';
  }

  ui.action.addEventListener('click', action);
  ui.pause.addEventListener('click', togglePause);
  ui.sound.addEventListener('click', () => {
    audio.toggle();
    if (state === 'play' && !document.hidden) audio.init();
    syncSoundButton();
  });
  bindTouchAction(ui['touch-gun'], cycleGun);
  bindTouchAction(ui['touch-reload'], () => { if (state === 'play') Arena.reload(game); });
  arms.forEach(button => button.addEventListener('click', () => {
    if (state === 'play') Arena.switchGun(game, Number(button.dataset.gun));
  }));
  document.addEventListener('keydown', e => {
    const code = e.code;
    if (movementKeys.has(code) && state === 'play') {
      e.preventDefault();
      keys.add(code);
    }
    if (e.repeat) return;
    if ((code === 'Enter' || code === 'NumpadEnter') && state !== 'play' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      action();
    }
    if (code === 'Escape' || code === 'KeyP') {
      e.preventDefault();
      togglePause();
    }
    if (state !== 'play') return;
    if (code === 'KeyR') Arena.reload(game);
    if (/^Digit[1-3]$/.test(code)) Arena.switchGun(game, Number(code.at(-1)) - 1);
  });
  document.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { if (state === 'play') change('paused', false); });
  window.addEventListener('resize', pauseForTouchLayout);
  screen.orientation?.addEventListener('change', pauseForTouchLayout);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (state === 'play') change('paused', false);
    else audio.stop();
  });
  ui.field.addEventListener('contextmenu', e => e.preventDefault());
  ui.field.addEventListener('pointerdown', e => {
    if (state !== 'play' || e.button !== 0) return;
    if (e.pointerType === 'touch') {
      setTouchMode(true);
      const p = point(e);
      const role = p.x < game.w / 2 ? 'move' : 'aim';
      if (touches[role]) return;
      mouse = null;
      isFiring = queuedShot = false;
      touches[role] = { id: e.pointerId, ox: p.x, oy: p.y, ...p };
    } else {
      setTouchMode(false);
      mouse = point(e);
      isFiring = queuedShot = true;
    }
    ui.field.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  ui.field.addEventListener('pointermove', e => {
    if (state !== 'play') return;
    if (e.pointerType === 'touch') {
      const touch = Object.values(touches).find(t => t?.id === e.pointerId);
      if (touch) Object.assign(touch, point(e));
    } else {
      mouse = point(e);
    }
  });
  function release(e) {
    if (e.pointerType === 'touch') {
      for (const role of Object.keys(touches)) {
        if (touches[role]?.id === e.pointerId) touches[role] = null;
      }
    } else {
      isFiring = false;
      if (e.type === 'pointercancel') {
        mouse = null;
        queuedShot = false;
      }
    }
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) ui.field.addEventListener(event, release);
  ui.field.addEventListener('pointerleave', () => { mouse = null; });
  syncSoundButton();
  change('ready', false);
  new ResizeObserver(fit).observe(ui.field);
  fit();
  requestAnimationFrame(frame);
})();
