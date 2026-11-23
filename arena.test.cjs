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
  advance(game, .53);
  const pickup = game.drops.find(d => d.kind === 'gun');
  assert.equal(pickup.amount, 1);
  Object.assign(game.player, { x: pickup.x, y: pickup.y });
  advance(game, .01);
  assert.equal(game.player.slot, 1);
  advance(game, .13);
  advance(game, .01, { ...idle, fire: true });
  assert.equal(game.arsenal[1].clip, 5);
  assert.equal(game.bullets.length, 7);
  assert.equal(arena.reload(game), true);
  advance(game, 1.15);
  assert.equal(game.arsenal[1].clip, 6);
  assert.equal(game.arsenal[1].reserve, 17);
  assert.equal(arena.switchGun(game, 0), true);
});

test('switching weapons lets a pending reload finish in the background', () => {
  const game = arena.create(960, 600);
  Object.assign(game.arsenal[1], { unlocked: true, clip: 5, reserve: 18 });
  assert.equal(arena.switchGun(game, 1), true);
  assert.equal(arena.reload(game), true);
  assert.equal(arena.switchGun(game, 0), true);
  advance(game, 1.15);
  assert.equal(arena.switchGun(game, 1), true);
  assert.equal(game.arsenal[1].clip, 6);
  assert.equal(game.arsenal[1].reserve, 17);
  assert.equal(game.arsenal[1].reload, 0);
});

test('every fourth wave includes a boss, and ranged enemies fire', () => {
  for (let i = 1; i <= 12; i++) {
    const roster = arena.waveRoster(i);
    assert.equal(roster.includes('boss'), i % 4 === 0);
    assert.ok(roster.includes('gunner'));
    if (i > 1) assert.ok(roster.includes('dash'));
  }
  const game = arena.create(960, 600);
  game.wave = 3;
  advance(game, 1.26);
  assert.equal(game.enemies[0].kind, 'boss');
  game.enemies[0].fire = 0;
  advance(game, .01);
  assert.equal(game.bullets.filter(b => b.enemy).length, 5);
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
  Object.assign(game.arsenal[1], { unlocked: true, clip: 6, reserve: 18 });
  assert.equal(arena.switchGun(game, 1), true);
  advance(game, .14);
  game.enemies.push({ x: 25, y: game.player.y, kind: 'scout', r: 14, hp: 46, max: 46, warm: 0, fire: 0, phase: 0, hit: 0 });
  advance(game, .01, { ...idle, angle: Math.PI, fire: true });
  assert.equal(game.arsenal[1].clip, 5);
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
