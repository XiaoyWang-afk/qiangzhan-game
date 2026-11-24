const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(require('node:path').join(__dirname, 'arena.js'), 'utf8');
const arena = runInNewContext(source + '\nArena');
const idle = { x: 0, y: 0 };

function advance(game, seconds, input = idle) {
  for (let i = 0; i < Math.ceil(seconds * 100); i++) arena.step(game, input, .01);
}

test('movement normalizes diagonal input and stays inside the arena', () => {
  const game = arena.create(960, 600);
  game.nextWave = Infinity;
  advance(game, .25, { x: -1, y: -1 });
  assert.ok(Math.abs(Math.hypot(game.player.x - 480, game.player.y - 300) - 63.75) < .01);
  advance(game, 3, { x: -1, y: -1 });
  assert.equal(game.player.x, 26);
  assert.equal(game.player.y, 26);
});

test('weapon pickup unlocks a slot and reload consumes the correct reserve', () => {
  const game = arena.create(960, 600);
  assert.equal(arena.switchGun(game, 1), false);
  assert.equal(game.notice, '未解锁 · 拾取霰弹枪');
  advance(game, arena.pacing.opening + .01);
  const pickup = game.drops.find(d => d.kind === 'gun');
  assert.equal(pickup.amount, 1);
  Object.assign(game.player, { x: pickup.x, y: pickup.y });
  advance(game, .01);
  assert.equal(game.player.slot, 0);
  assert.equal(arena.switchGun(game, 1), true);
  advance(game, .13);
  advance(game, .01, { ...idle, fire: true });
  assert.equal(game.arsenal[1].clip, 7);
  assert.equal(game.bullets.length, 7);
  assert.equal(arena.reload(game), true);
  advance(game, 1.15);
  assert.equal(game.arsenal[1].clip, 8);
  assert.equal(game.arsenal[1].reserve, 17);
  assert.equal(arena.switchGun(game, 0), true);
});

test('switching weapons lets a pending reload finish in the background', () => {
  const game = arena.create(960, 600);
  Object.assign(game.arsenal[1], { unlocked: true, clip: 7, reserve: 18 });
  assert.equal(arena.switchGun(game, 1), true);
  assert.equal(arena.reload(game), true);
  assert.equal(arena.switchGun(game, 0), true);
  advance(game, 1.15);
  assert.equal(arena.switchGun(game, 1), true);
  assert.equal(game.arsenal[1].clip, 8);
  assert.equal(game.arsenal[1].reserve, 17);
  assert.equal(game.arsenal[1].reload, 0);
});

test('opening waves add threats gradually and bosses have only a small scout escort', () => {
  assert.deepEqual(Array.from(arena.waveRoster(1)), ['scout', 'scout', 'scout', 'scout']);
  assert.equal(arena.waveRoster(2).filter(kind => kind === 'gunner').length, 1);
  assert.equal(arena.waveRoster(2).includes('dash'), false);
  assert.equal(arena.waveRoster(3).filter(kind => kind === 'gunner').length, 1);
  assert.equal(arena.waveRoster(3).filter(kind => kind === 'dash').length, 2);
  for (let i = 4; i <= 12; i++) {
    const roster = arena.waveRoster(i);
    assert.equal(roster.includes('boss'), i % 4 === 0);
    if (i % 4 === 0) {
      assert.ok(roster.length <= 4);
      assert.ok(roster.slice(1).every(kind => kind === 'scout'));
    } else {
      assert.ok(roster.includes('gunner') && roster.includes('dash'));
    }
  }
});

test('a boss telegraphs and commits to its fan before firing', () => {
  const game = arena.create(960, 600);
  game.wave = 3;
  game.nextWave = .01;
  advance(game, .8);
  const boss = game.enemies[0];
  assert.equal(boss.kind, 'boss');
  boss.fire = arena.pacing.bossTell + .02;
  advance(game, .03);
  const angle = boss.volleyAngle;
  assert.equal(typeof angle, 'number');
  assert.equal(game.bullets.length, 0);
  game.player.y += 100;
  advance(game, arena.pacing.bossTell + .02);
  const volley = game.bullets.filter(b => b.enemy);
  assert.deepEqual(Array.from(volley, b => b.a), Array.from(arena.pacing.bossFan, offset => angle + offset));
  assert.equal(boss.volleyAngle, null);
});

test('the opening waits before spawning and a cleared wave heals and clears incoming shots', () => {
  const game = arena.create(960, 600);
  advance(game, arena.pacing.opening - .02);
  assert.equal(game.wave, 0);
  assert.equal(game.enemies.length, 0);
  advance(game, .04);
  assert.equal(game.wave, 1);
  assert.equal(game.nextWave, null);
  game.pending = [];
  game.player.hp = 70;
  game.bullets.push({ enemy: true });
  advance(game, .01);
  assert.equal(game.player.hp, 86);
  assert.equal(game.bullets.length, 0);
  assert.ok(game.nextWave > 3.9);
  advance(game, 2);
  assert.equal(game.wave, 1);
  assert.equal(game.player.hp, 86);
  advance(game, 2.1);
  assert.equal(game.wave, 2);
});

test('an idle-score wave sends a faster interceptor ahead of the player', () => {
  const game = arena.create(1200, 600);
  game.wave = 1;
  game.nextWave = null;
  game.elapsed = arena.pacing.pressureAfter - .02;
  game.enemies.push({ x: 150, y: 300, kind: 'scout', r: 14, hp: 46, max: 46, warm: 0, fire: 0, phase: 0, hit: 0 });
  advance(game, .03, { x: 1, y: 0 });
  const threat = game.enemies.find(e => e.interceptor);
  assert.equal(threat.kind, 'dash');
  assert.ok(threat.x > game.player.x);
  assert.equal(game.notice, '警报 · 敌机包抄');
  advance(game, .59, { x: 1, y: 0 });
  const x = threat.x;
  const y = threat.y;
  advance(game, .01, { x: 1, y: 0 });
  assert.ok(Math.hypot(threat.x - x, threat.y - y) > 2.55);
});

test('successful hits score once, update the best run, and allow the next wave', () => {
  const game = arena.create(960, 600, 30);
  game.wave = 1;
  game.nextWave = .15;
  game.enemies.push({ x: 540, y: 300, kind: 'scout', r: 14, hp: 20, max: 46, warm: 0, fire: 0, phase: 0, hit: 0 });
  advance(game, .1, { ...idle, aim: { x: 540, y: 300 }, fire: true });
  assert.equal(game.enemies.length, 0);
  assert.equal(game.score, 100);
  assert.equal(game.best, 100);
  assert.equal(game.newRecord, true);
  advance(game, .15);
  assert.equal(game.wave, 2);
});

test('tying the saved record does not count as a new record', () => {
  const game = arena.create(960, 600, 100);
  game.enemies.push({ x: 540, y: 300, kind: 'scout', r: 14, hp: 20, max: 46, warm: 0, fire: 0, phase: 0, hit: 0 });
  advance(game, .1, { ...idle, angle: 0, fire: true });
  assert.equal(game.score, 100);
  assert.equal(game.best, 100);
  assert.equal(game.newRecord, false);
});

test('coincident enemies spread apart and do not cover the player', () => {
  const game = arena.create(960, 600);
  game.wave = 12;
  for (const kind of ['scout', 'boss', 'dash']) {
    const { r, hp } = arena.types[kind];
    game.enemies.push({ x: game.player.x, y: game.player.y, kind, r, hp, max: hp, warm: 0, fire: 1, phase: 0, hit: 0 });
  }
  advance(game, .12);
  for (const a of game.enemies) {
    assert.ok(Math.hypot(a.x - game.player.x, a.y - game.player.y) >= a.r + game.player.r - .01);
    for (const b of game.enemies) {
      if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r);
    }
  }
});

test('a point-blank shotgun blast hits an overlapping scout before the muzzle', () => {
  const game = arena.create(960, 600);
  game.player.x = 26;
  Object.assign(game.arsenal[1], { unlocked: true, clip: 8, reserve: 18 });
  assert.equal(arena.switchGun(game, 1), true);
  advance(game, .14);
  game.enemies.push({ x: 25, y: game.player.y, kind: 'scout', r: 14, hp: 46, max: 46, warm: 0, fire: 0, phase: 0, hit: 0 });
  advance(game, .01, { ...idle, angle: Math.PI, fire: true });
  assert.equal(game.arsenal[1].clip, 7);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.score, 100);
});

test('ammo stays available and silent until at least one reserve can refill', () => {
  const game = arena.create(960, 600);
  const drop = { x: game.player.x, y: game.player.y, kind: 'ammo', life: 2 };
  game.drops.push(drop);
  advance(game, .01);
  assert.equal(game.drops.includes(drop), true);
  assert.equal(game.events.includes('pickup'), false);
  Object.assign(game.arsenal[1], { unlocked: true, reserve: 54 });
  advance(game, .01);
  assert.equal(game.drops.includes(drop), true);
  assert.equal(game.events.includes('pickup'), false);
  game.arsenal[1].reserve = 51;
  advance(game, .01);
  assert.equal(game.drops.includes(drop), false);
  assert.equal(game.arsenal[1].reserve, 54);
  assert.equal(game.events.includes('pickup'), true);
});

test('health and ammo pickups refill resources, and lethal damage ends the run', () => {
  const game = arena.create(960, 600);
  Object.assign(game.arsenal[2], { unlocked: true, reserve: 0 });
  game.player.hp = 75;
  game.drops.push({ x: 480, y: 300, kind: 'health', life: 2, amount: 24 });
  game.drops.push({ x: 480, y: 300, kind: 'ammo', life: 2, amount: 1 });
  advance(game, .01);
  assert.equal(game.player.hp, 99);
  assert.equal(game.arsenal[2].reserve, 56);
  game.bullets.push({ x: 475, y: 300, a: 0, speed: 1, r: 4, life: .1, damage: 100, enemy: true });
  advance(game, .01);
  assert.equal(game.player.hp, 0);
  const time = game.elapsed;
  advance(game, 3, { x: 1, y: 1, fire: true });
  assert.equal(game.elapsed, time);
  assert.equal(game.player.x, 480);
});
