'use strict';

const Arena = (() => {
  const TAU = Math.PI * 2;
  const guns = [
    { name: '手枪', size: 12, reserve: Infinity, rate: .25, reload: .73, damage: 27, speed: 790, count: 1, spread: 0, life: 1.12, color: '#fff5c6' },
    { name: '霰弹枪', size: 6, reserve: 18, rate: .57, reload: 1.13, damage: 17, speed: 720, count: 7, spread: .49, life: .36, color: '#ffb469' },
    { name: '冲锋枪', size: 28, reserve: 84, rate: .09, reload: .94, damage: 14, speed: 880, count: 1, spread: .14, life: .79, color: '#a4f4ff' },
  ];
  const types = {
    scout: { hp: 46, speed: 82, r: 14, damage: 10, score: 100, color: '#ff7c9b' },
    dash: { hp: 32, speed: 146, r: 11, damage: 8, score: 150, color: '#ffba72' },
    gunner: { hp: 64, speed: 70, r: 17, damage: 12, score: 230, color: '#d3a2ff' },
    boss: { hp: 510, speed: 51, r: 33, damage: 22, score: 1000, color: '#ff80d5' },
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const random = (min, max) => min + Math.random() * (max - min);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const length = (x, y) => Math.hypot(x, y);
  const readout = (n, width = 5) => String(n).padStart(width, '0');

  function create(w, h, best = 0) {
    return {
      w, h, best, score: 0, elapsed: 0, wave: 0, spawnIn: 0, nextWave: .52,
      player: { x: w / 2, y: h / 2, r: 15, hp: 100, angle: -Math.PI / 2, heat: 0, reload: 0, shield: 0, flash: 0, slot: 0 },
      arsenal: guns.map((gun, i) => ({ clip: i ? 0 : gun.size, reserve: i ? 0 : Infinity, unlocked: i === 0 })),
      pending: [], enemies: [], bullets: [], drops: [], sparks: [], rings: [], events: [],
      shake: 0, red: 0, notice: '', noticeTime: 0,
    };
  }

  function resize(s, w, h) {
    if (s.w === w && s.h === h) return;
    const sx = w / s.w;
    const sy = h / s.h;
    for (const list of [[s.player], s.enemies, s.bullets, s.drops, s.sparks, s.rings]) {
      for (const item of list) {
        item.x *= sx;
        item.y *= sy;
      }
    }
    s.w = w;
    s.h = h;
  }

  function notify(s, notice, time = 1.9) {
    s.notice = notice;
    s.noticeTime = time;
  }

  function switchGun(s, slot) {
    if (!s.arsenal[slot]?.unlocked || slot === s.player.slot) return false;
    s.player.slot = slot;
    s.player.reload = 0;
    s.player.heat = Math.max(.12, s.player.heat);
    s.events.push('switch');
    return true;
  }

  function reload(s) {
    const p = s.player;
    const ammo = s.arsenal[p.slot];
    if (p.reload || ammo.clip === guns[p.slot].size || ammo.reserve === 0) return false;
    p.reload = guns[p.slot].reload;
    s.events.push('reload');
    return true;
  }

  function burst(s, x, y, color, count, force = 150) {
    for (let i = 0; i < count; i++) {
      const a = random(0, TAU);
      const v = random(force * .28, force);
      const life = random(.18, .52);
      s.sparks.push({ x, y, dx: Math.cos(a) * v, dy: Math.sin(a) * v, life, max: life, color });
    }
  }

  function ring(s, x, y, color, radius = 40) {
    s.rings.push({ x, y, life: .42, max: .42, color, radius });
  }

  function waveRoster(wave) {
    const list = [];
    if (wave % 4 === 0) list.push('boss');
    for (let i = 0; i < Math.min(4 + wave * 2, 26); i++) {
      list.push(i % 4 === 2 ? 'gunner' : wave >= 2 && i % 3 === 1 ? 'dash' : 'scout');
    }
    return list;
  }

  function drop(s, x, y, kind, amount = 0) {
    s.drops.push({ x: clamp(x, 25, s.w - 25), y: clamp(y, 25, s.h - 25), kind, amount, life: 18 });
  }

  function startWave(s) {
    s.wave++;
    s.pending = waveRoster(s.wave);
    s.spawnIn = .1;
    notify(s, s.wave % 4 === 0 ? '警报 · 首领入侵' : '第 ' + readout(s.wave, 2) + ' 波 · 敌机来袭');
    s.events.push(s.wave % 4 === 0 ? 'alarm' : 'wave');
    if (!s.arsenal[1].unlocked && !s.drops.some(d => d.kind === 'gun' && d.amount === 1)) drop(s, s.w * .67, s.h * .54, 'gun', 1);
    if (s.wave >= 2 && !s.arsenal[2].unlocked && !s.drops.some(d => d.kind === 'gun' && d.amount === 2)) drop(s, s.w * .32, s.h * .48, 'gun', 2);
  }

  function spawn(s, kind) {
    const t = types[kind];
    const positions = [
      { x: s.w * .13, y: random(.15, .85) * s.h },
      { x: s.w * .87, y: random(.15, .85) * s.h },
      { x: random(.12, .88) * s.w, y: s.h * .11 },
      { x: random(.12, .88) * s.w, y: s.h * .89 },
    ];
    const distant = positions.filter(pos => distance(pos, s.player) >= Math.min(s.w, s.h) * .32);
    const choices = distant.length ? distant : positions;
    const pos = choices[Math.floor(Math.random() * choices.length)];
    const max = Math.ceil(t.hp * (1 + (s.wave - (kind === 'boss' ? 4 : 1)) * .055));
    s.enemies.push({ ...pos, kind, max, hp: max, r: t.r, angle: angleTo(pos, s.player), warm: .56, fire: random(.78, 1.65), phase: random(0, TAU), hit: 0 });
    ring(s, pos.x, pos.y, t.color, t.r * 2.6);
  }

  function fire(s) {
    const p = s.player;
    const gun = guns[p.slot];
    const ammo = s.arsenal[p.slot];
    if (p.heat || p.reload) return;
    if (!ammo.clip) {
      if (!reload(s)) {
        p.heat = .24;
        s.events.push('dry');
      }
      return;
    }
    ammo.clip--;
    p.heat = gun.rate;
    p.flash = .075;
    s.shake = Math.max(s.shake, [2.4, 6.5, 1.8][p.slot]);
    for (let i = 0; i < gun.count; i++) {
      const a = p.angle + (gun.count === 1 ? random(-gun.spread / 2, gun.spread / 2) : (i / (gun.count - 1) - .5) * gun.spread);
      s.bullets.push({ x: p.x + Math.cos(a) * 23, y: p.y + Math.sin(a) * 23, a, speed: gun.speed, life: gun.life, damage: gun.damage, color: gun.color, enemy: false, r: 2.4 });
    }
    burst(s, p.x + Math.cos(p.angle) * 25, p.y + Math.sin(p.angle) * 25, gun.color, p.slot === 1 ? 9 : 3, 88);
    s.events.push('shot' + p.slot);
  }

  function hurt(s, amount) {
    const p = s.player;
    if (p.shield || p.hp <= 0) return;
    p.hp = Math.max(0, p.hp - amount);
    p.shield = .63;
    s.shake = 9;
    s.red = .58;
    s.events.push('hurt');
    burst(s, p.x, p.y, '#6af8de', p.hp ? 10 : 36, p.hp ? 120 : 260);
    if (!p.hp) ring(s, p.x, p.y, '#6af8de', 95);
  }

  function hitEnemy(s, e, b) {
    const t = types[e.kind];
    e.hp = Math.max(0, e.hp - b.damage);
    e.hit = .12;
    burst(s, b.x, b.y, t.color, 4);
    if (e.hp) return;
    s.score += t.score;
    s.best = Math.max(s.best, s.score);
    s.shake = Math.max(s.shake, e.kind === 'boss' ? 13 : 4);
    s.events.push(e.kind === 'boss' ? 'alarm' : 'kill');
    burst(s, e.x, e.y, t.color, e.kind === 'boss' ? 42 : 17, e.kind === 'boss' ? 270 : 168);
    ring(s, e.x, e.y, t.color, t.r * 3.5);
    const chance = Math.random();
    if (e.kind === 'boss' || chance < .21) drop(s, e.x, e.y, 'health', 24);
    else if (chance < .45) drop(s, e.x, e.y, 'ammo', 1);
  }

  function updateEnemies(s, dt) {
    const p = s.player;
    for (const e of s.enemies) {
      e.hit = Math.max(0, e.hit - dt);
      e.angle = angleTo(e, p);
      if (e.warm > 0) {
        e.warm -= dt;
        continue;
      }
      const t = types[e.kind];
      const dist = distance(p, e);
      const ranged = e.kind === 'gunner' || e.kind === 'boss';
      const spacing = Math.min(s.w, s.h) * (e.kind === 'boss' ? .36 : .39);
      const direction = ranged && dist < spacing ? (dist < spacing * .68 ? -.66 : 0) : 1;
      const speed = t.speed * (1 + Math.min(.55, (s.wave - 1) * .038));
      const sidestep = ranged ? Math.sin(s.elapsed * 2.4 + e.phase) * .34 : 0;
      e.x += (Math.cos(e.angle) * direction - Math.sin(e.angle) * sidestep) * speed * dt;
      e.y += (Math.sin(e.angle) * direction + Math.cos(e.angle) * sidestep) * speed * dt;
      for (const other of s.enemies) {
        if (e === other || other.warm > 0) continue;
        const gap = distance(e, other);
        if (gap && gap < e.r + other.r + 4) {
          const repel = (e.r + other.r + 4 - gap) * dt * 3.8 / gap;
          e.x += (e.x - other.x) * repel;
          e.y += (e.y - other.y) * repel;
        }
      }
      e.x = clamp(e.x, e.r + 11, s.w - e.r - 11);
      e.y = clamp(e.y, e.r + 11, s.h - e.r - 11);
      if (dist < e.r + p.r) hurt(s, t.damage);
      if (ranged && (e.fire -= dt) <= 0) {
        const boss = e.kind === 'boss';
        for (const offset of boss ? [-.5, -.25, 0, .25, .5] : [0]) {
          const a = e.angle + offset;
          s.bullets.push({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, a, speed: boss ? 252 : 278, life: 3.6, damage: boss ? 15 : t.damage, color: t.color, enemy: true, r: boss ? 5 : 4 });
        }
        e.fire = boss ? 1.29 : 1.65;
        burst(s, e.x + Math.cos(e.angle) * e.r, e.y + Math.sin(e.angle) * e.r, t.color, 5, 75);
      }
    }
  }

  function segmentDistance(a, x, y, target) {
    const dx = a.x - x;
    const dy = a.y - y;
    const f = clamp(((target.x - x) * dx + (target.y - y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(target.x - x - dx * f, target.y - y - dy * f);
  }

  function updateBullets(s, dt) {
    const p = s.player;
    s.bullets = s.bullets.filter(b => {
      if ((b.life -= dt) <= 0) return false;
      const { x, y } = b;
      b.x += Math.cos(b.a) * b.speed * dt;
      b.y += Math.sin(b.a) * b.speed * dt;
      if (b.enemy) {
        if (segmentDistance(b, x, y, p) < p.r + b.r) {
          hurt(s, b.damage);
          return false;
        }
      } else {
        for (const e of s.enemies) {
          if (e.hp > 0 && e.warm <= 0 && segmentDistance(b, x, y, e) < e.r + b.r) {
            hitEnemy(s, e, b);
            return false;
          }
        }
      }
      return b.x >= -12 && b.y >= -12 && b.x <= s.w + 12 && b.y <= s.h + 12;
    });
    s.enemies = s.enemies.filter(e => e.hp > 0);
  }

  function updateDrops(s, dt) {
    const p = s.player;
    s.drops = s.drops.filter(d => {
      if ((d.life -= dt) <= 0) return false;
      if (distance(p, d) > p.r + 14) return true;
      if (d.kind === 'health') {
        if (p.hp === 100) return true;
        p.hp = Math.min(100, p.hp + d.amount);
        notify(s, '已拾取 · 生命补给');
      } else if (d.kind === 'ammo') {
        for (const [index, ammo] of s.arsenal.entries()) {
          if (ammo.unlocked && index) ammo.reserve = Math.min(guns[index].reserve * 3, ammo.reserve + guns[index].size * 2);
        }
        notify(s, '已拾取 · 弹药补给');
      } else {
        const gun = guns[d.amount];
        Object.assign(s.arsenal[d.amount], { unlocked: true, clip: gun.size, reserve: gun.reserve });
        switchGun(s, d.amount);
        notify(s, '已解锁 · ' + gun.name);
      }
      s.events.push('pickup');
      ring(s, d.x, d.y, '#7effdb', 63);
      burst(s, d.x, d.y, '#7effdb', 13, 120);
      return false;
    });
  }

  function effects(s, dt) {
    s.shake = Math.max(0, s.shake - 29 * dt);
    s.red = Math.max(0, s.red - 2.7 * dt);
    s.noticeTime = Math.max(0, s.noticeTime - dt);
    s.sparks = s.sparks.filter(b => {
      b.x += b.dx * dt;
      b.y += b.dy * dt;
      b.dx *= 1 - 3 * dt;
      b.dy *= 1 - 3 * dt;
      return (b.life -= dt) > 0;
    });
    s.rings = s.rings.filter(r => (r.life -= dt) > 0);
  }

  function step(s, input, dt) {
    if (s.player.hp <= 0) {
      effects(s, dt);
      return;
    }
    const p = s.player;
    s.elapsed += dt;
    effects(s, dt);
    p.heat = Math.max(0, p.heat - dt);
    p.flash = Math.max(0, p.flash - dt);
    p.shield = Math.max(0, p.shield - dt);
    if (p.reload > 0 && (p.reload = Math.max(0, p.reload - dt)) === 0) {
      const ammo = s.arsenal[p.slot];
      const count = Math.min(guns[p.slot].size - ammo.clip, ammo.reserve);
      ammo.clip += count;
      ammo.reserve -= count;
      s.events.push('loaded');
    }
    const move = Math.max(1, length(input.x, input.y));
    p.x = clamp(p.x + input.x / move * dt * 255, 26, s.w - 26);
    p.y = clamp(p.y + input.y / move * dt * 255, 26, s.h - 26);
    if (input.angle != null) p.angle = input.angle;
    else if (input.aim) p.angle = angleTo(p, input.aim);
    if (input.fire) fire(s);

    if (s.pending.length) {
      if ((s.spawnIn -= dt) <= 0) {
        spawn(s, s.pending.shift());
        s.spawnIn = Math.max(.31, .68 - s.wave * .026);
      }
    } else if (!s.enemies.length && (s.nextWave -= dt) <= 0) {
      startWave(s);
      s.nextWave = 1.7;
    }
    updateEnemies(s, dt);
    updateBullets(s, dt);
    if (p.hp) updateDrops(s, dt);
  }

  return { create, resize, step, switchGun, reload, guns, types, waveRoster, readout, TAU };
})();
