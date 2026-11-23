'use strict';

const Visual = (() => {
  const { TAU, types, guns, pacing } = Arena;
  const ink = '#494b40';
  const blue = '#386789';
  const red = '#b45242';
  const ochre = '#a87c35';
  const hostile = '#892c62';
  const green = '#5b7a65';
  const colors = { scout: red, dash: ochre, gunner: '#777052', boss: '#994b42' };
  const palette = {
    '#fff5c6': blue, '#ffb469': ochre, '#a4f4ff': blue,
    '#ff7c9b': red, '#ffba72': ochre, '#d3a2ff': '#777052', '#ff80d5': red,
    '#6af8de': blue, '#7effdb': green, '#9cf389': green,
  };
  const pigment = color => palette[color] || color;

  function path(c, points, close = false) {
    c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    if (close) c.closePath();
  }

  function circle(c, x, y, r) {
    c.beginPath();
    c.ellipse(x, y, r, r * .94, -.13, 0, TAU);
  }

  function sketch(c, points, fill, stroke = ink, width = 1.5) {
    path(c, points, true);
    c.fillStyle = fill;
    c.fill();
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.stroke();
    c.save();
    c.translate(1.2, -.9);
    c.globalAlpha *= .35;
    c.lineWidth = .6;
    c.stroke();
    c.restore();
  }

  function line(c, points, color = ink, width = 1) {
    c.strokeStyle = color;
    c.lineWidth = width;
    path(c, points);
    c.stroke();
  }

  function hatch(c, r, color) {
    c.save();
    c.clip();
    for (let x = -r * 2; x <= r * 2; x += 4) line(c, [[x, -r], [x + r, r]], color, .6);
    c.restore();
  }

  function label(c, text, x, y, size = 18, color = '#969584', angle = 0) {
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.fillStyle = color;
    c.font = size + 'px Notebook, serif';
    c.fillText(text, 0, 0);
    c.restore();
  }

  function makeFloor(w, h) {
    const floor = document.createElement('canvas');
    floor.width = Math.ceil(w);
    floor.height = Math.ceil(h);
    const c = floor.getContext('2d');
    c.fillStyle = '#faf7ed';
    c.fillRect(0, 0, w, h);
    c.lineWidth = .7;
    for (let x = 0; x < w; x += 28) line(c, [[x, 0], [x, h]], '#b7c6c52e', .7);
    for (let y = 0; y < h; y += 28) line(c, [[0, y], [w, y]], '#b7c6c54a', .7);
    // A deterministic paper grain avoids animation noise and keeps the floor cached.
    let seed = 17;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < w * h / 65; i++) {
      c.fillStyle = i % 3 ? '#8c856114' : '#ffffff78';
      c.fillRect(random() * w, random() * h, random() * 1.4 + .2, .7);
    }
    line(c, [[51, 0], [49, h]], '#c285773f', 1);
    c.save();
    c.setLineDash([6, 7]);
    line(c, [[70, 62], [w - 27, 60], [w - 24, h - 28], [72, h - 26], [70, 62]], '#9b9c894b');
    c.restore();
    for (const y of [.2, .5, .8]) {
      circle(c, 17, h * y, 5);
      c.fillStyle = '#e8e3d6'; c.fill();
      c.strokeStyle = '#bcb9a866'; c.stroke();
    }
    c.save();
    c.translate(w * .5, h * .5);
    c.globalAlpha = .22;
    circle(c, 0, 0, 75); c.strokeStyle = '#959b8c'; c.stroke();
    circle(c, 1, -1, 78); c.stroke();
    line(c, [[-86, 0], [87, 1]], '#959b8c');
    line(c, [[0, -88], [1, 88]], '#959b8c');
    c.restore();
    label(c, '守住这里', w * .5 - 31, h * .5 + 108, 17, '#b9b9a7', -.07);
    label(c, '别被包围！', 86, h - 47, 21, '#a5a28c', -.1);
    line(c, [[94, h - 81], [117, h - 110], [145, h - 108]], '#b2b09a');
    line(c, [[135, h - 113], [145, h - 108], [134, h - 103]], '#b2b09a');
    label(c, '每四波', w - 135, h - 83, 18, '#b4a28e', .09);
    label(c, '首领来袭', w - 136, h - 59, 18, '#b4a28e', .09);
    // A tiny pencil star in the upper right corner.
    c.save(); c.translate(w - 50, 32); c.rotate(.2);
    line(c, [[0, -10], [3, -3], [11, -2], [5, 3], [6, 11], [0, 6], [-7, 10], [-5, 2], [-11, -3], [-3, -3], [0, -10]], '#9e9b81');
    c.restore();
    return floor;
  }

  function player(c, p, elapsed) {
    c.save(); c.translate(p.x, p.y);
    c.globalAlpha = p.shield && Math.sin(elapsed * 46) < 0 ? .4 : 1;
    circle(c, 0, 0, 23); c.strokeStyle = '#38678940'; c.lineWidth = .9; c.stroke();
    c.rotate(p.angle);
    line(c, [[-24, -7], [-17, -7]], '#38678999');
    line(c, [[-27, 0], [-20, 0]], '#38678966');
    line(c, [[-24, 7], [-17, 7]], '#38678999');
    sketch(c, [[19, 0], [-12, -13], [-7, 0], [-12, 13]], '#d9e4e5', blue, 1.8);
    line(c, [[-7, 0], [17, 0], [-10, 10]], blue, 1.2);
    line(c, [[-9, -9], [5, -2]], '#38678966', .7);
    if (p.flash > 0) {
      sketch(c, [[23, 0], [30, -7], [30, -2], [40, 0], [30, 3], [29, 8]], '#d2ae5c80', ochre, 1);
    }
    c.restore();
  }

  function drone(c, e) {
    const color = colors[e.kind];
    const boss = e.kind === 'boss';
    c.save(); c.translate(e.x, e.y);
    if (e.warm > 0) {
      c.globalAlpha = Math.max(.15, 1 - e.warm * 1.3);
      c.setLineDash([3, 4]); circle(c, 0, 0, e.r + e.warm * 27);
      c.strokeStyle = color; c.lineWidth = 1; c.stroke(); c.setLineDash([]);
    }
    // Different silhouettes, still aligned with the original collision radii.
    c.rotate(e.angle);
    const r = e.r;
    const points = e.kind === 'dash'
      ? [[r, 0], [1, r * .8], [-r, r * .5], [-r * .6, 0], [-r, -r * .5], [1, -r * .8]]
      : Array.from({ length: boss ? 24 : 12 }, (_, i) => {
        const a = i * TAU / (boss ? 24 : 12);
        const size = r * (i % 2 ? .81 : 1);
        return [Math.cos(a) * size, Math.sin(a) * size];
      });
    sketch(c, points, e.hit > 0 ? '#fffdf5' : boss ? '#e7c9b7' : e.kind === 'dash' ? '#ede0b8' : '#e9ddd0', color, boss ? 2 : 1.5);
    path(c, points, true); hatch(c, r, color + '45');
    if (e.kind === 'gunner' || boss) {
      sketch(c, [[r * .62, -4], [r + 7, -4], [r + 7, 4], [r * .62, 4]], '#ddd8bf', color, 1.2);
    }
    c.rotate(-e.angle);
    // Ink eyes make the enemies read as notebook monsters, not neon drones.
    const eye = boss ? 7 : 3;
    for (const side of [-1, 1]) {
      circle(c, side * r * .29, -r * .1, eye);
      c.fillStyle = '#faf7ed'; c.fill(); c.strokeStyle = color; c.lineWidth = 1.1; c.stroke();
      circle(c, side * r * .29 + Math.cos(e.angle) * 1.7, -r * .1 + Math.sin(e.angle) * 1.7, boss ? 2.5 : 1.2);
      c.fillStyle = color; c.fill();
    }
    line(c, [[-r * .28, r * .4], [0, r * .32], [r * .28, r * .4]], color, 1.2);
    if (boss) {
      sketch(c, [[-18, -r - 3], [-21, -r - 15], [-9, -r - 10], [0, -r - 20], [9, -r - 10], [20, -r - 15], [17, -r - 2]], '#dfc08b', color, 1.4);
      label(c, '首领', -18, r + 32, 18, color, -.06);
    }
    if (e.hp < e.max || boss) {
      c.fillStyle = '#d4cdb7'; c.fillRect(-r, -r - (boss ? 30 : 10), r * 2, 3);
      c.fillStyle = color; c.fillRect(-r, -r - (boss ? 30 : 10), r * 2 * e.hp / e.max, 3);
    }
    c.restore();
  }

  function pickup(c, d, time) {
    const color = d.kind === 'health' ? green : d.kind === 'ammo' ? ochre : blue;
    c.save(); c.translate(d.x, d.y + Math.sin(time * 4 + d.x) * 3); c.rotate(-.12);
    if (d.life < 3) c.globalAlpha = .5 + .5 * Math.sin(time * 13) ** 2;
    sketch(c, [[-12, -13], [13, -12], [12, 12], [-13, 13]], '#fff9de', color, 1.3);
    c.fillStyle = color;
    if (d.kind === 'health') { c.fillRect(-2, -6, 4, 12); c.fillRect(-6, -2, 12, 4); }
    else if (d.kind === 'ammo') { for (let i = -5; i <= 5; i += 5) c.fillRect(i - 1, -4, 3, 8); }
    else {
      c.fillRect(-6, -4, 12, 4); c.fillRect(-4, 0, 4, 5);
      c.font = '16px Notebook, "Noto Sans SC Arcade", sans-serif';
      c.textAlign = 'center';
      c.lineWidth = 3;
      c.strokeStyle = '#faf7ed';
      c.strokeText(guns[d.amount].name, 0, 31);
      c.fillText(guns[d.amount].name, 0, 31);
    }
    c.restore();
  }

  function bossTell(c, e) {
    if (e.volleyAngle == null) return;
    const progress = 1 - e.fire / pacing.bossTell;
    const radius = 147 + 37 * progress;
    c.save();
    c.translate(e.x, e.y);
    c.rotate(e.volleyAngle);
    c.globalAlpha = .44 + .36 * progress;
    c.setLineDash([6, 5]);
    for (const a of pacing.bossFan) {
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      line(c, [[dx * (e.r + 6), dy * (e.r + 6)], [dx * radius, dy * radius]], hostile, 1.5);
    }
    c.restore();
  }

  function crosshair(c, x, y) {
    c.strokeStyle = blue; c.lineWidth = 1.1; circle(c, x, y, 8); c.stroke();
    line(c, [[x - 13, y], [x - 5, y]], blue);
    line(c, [[x + 5, y], [x + 13, y]], blue);
    line(c, [[x, y - 13], [x, y - 5]], blue);
    line(c, [[x, y + 5], [x, y + 13]], blue);
  }

  function sticks(c, touches, w, h) {
    for (const [role, color, pos] of [['move', blue, .16], ['aim', red, .84]]) {
      const t = touches[role];
      const x = t?.ox ?? w * pos;
      const y = t?.oy ?? h * .78;
      c.globalAlpha = t ? .8 : .5;
      c.fillStyle = '#f4eddaaa'; c.strokeStyle = color; c.lineWidth = 1.2;
      circle(c, x, y, 41); c.fill(); c.stroke();
      circle(c, x - 1, y + 1, 44); c.lineWidth = .5; c.stroke();
      const dx = (t?.x ?? x) - x;
      const dy = (t?.y ?? y) - y;
      const scale = Math.min(1, 31 / (Math.hypot(dx, dy) || 1));
      c.fillStyle = color; circle(c, x + dx * scale, y + dy * scale, 8); c.fill();
    }
    c.globalAlpha = 1;
  }

  function damageEdges(c, w, h, alpha) {
    const depth = Math.min(52, Math.min(w, h) * .115);
    const edges = [
      [0, 0, w, depth, 0, 0, 0, depth],
      [0, h - depth, w, depth, 0, h, 0, h - depth],
      [0, 0, depth, h, 0, 0, depth, 0],
      [w - depth, 0, depth, h, w, 0, w - depth, 0],
    ];
    for (const [x, y, width, height, x0, y0, x1, y1] of edges) {
      const edge = c.createLinearGradient(x0, y0, x1, y1);
      edge.addColorStop(0, 'rgba(180,82,66,' + alpha * .8 + ')');
      edge.addColorStop(1, '#b4524200');
      c.fillStyle = edge;
      c.fillRect(x, y, width, height);
    }
  }

  function renderer(c) {
    let floor;
    document.fonts.ready.then(() => { floor = null; });
    return (s, options) => {
      const { w, h } = s;
      const time = options.time;
      if (!floor || floor.width !== Math.ceil(w) || floor.height !== Math.ceil(h)) floor = makeFloor(w, h);
      c.fillStyle = '#faf7ed'; c.fillRect(0, 0, w, h);
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
      const n = options.reduced ? 0 : s.shake;
      if (n) c.translate((Math.random() - .5) * n, (Math.random() - .5) * n);
      c.drawImage(floor, 0, 0, w, h);
      if (options.demo) {
        for (const [x, y, kind] of [[.16, .36, 'gunner'], [.24, .66, 'dash'], [.84, .35, 'boss'], [.76, .67, 'scout']]) {
          const t = types[kind];
          drone(c, { x: w * x, y: h * y + Math.sin(time * .9 + x * 7) * 4, kind, angle: Math.atan2(.5 - y, .5 - x), hp: t.hp, max: t.hp, r: t.r });
        }
        c.save(); c.translate(w * .12, h * .64); c.rotate(-.5);
        sketch(c, [[20, 0], [-14, -14], [-8, 0], [-14, 14]], '#d9e4e5', blue);
        line(c, [[-8, 0], [18, 0], [-12, 11]], blue); c.restore();
      }
      for (const r of s.rings) {
        c.globalAlpha = r.life / r.max * .65; c.strokeStyle = pigment(r.color); c.lineWidth = 1.1;
        circle(c, r.x, r.y, Math.max(1, (1 - r.life / r.max) * r.radius)); c.stroke();
      }
      c.globalAlpha = 1;
      for (const e of s.enemies) bossTell(c, e);
      for (const d of s.drops) pickup(c, d, time);
      for (const e of s.enemies) drone(c, e);
      for (const b of s.bullets) {
        const color = b.enemy ? hostile : pigment(b.color);
        line(c, [[b.x - Math.cos(b.a) * 12, b.y - Math.sin(b.a) * 12], [b.x, b.y]], color, b.enemy ? 1.7 : 2);
        circle(c, b.x, b.y, b.r); c.fillStyle = color; c.fill();
      }
      for (const p of s.sparks) {
        c.globalAlpha = p.life / p.max; c.fillStyle = pigment(p.color);
        circle(c, p.x, p.y, 1.4); c.fill();
      }
      c.globalAlpha = 1;
      if (s.player.hp > 0 && !options.demo) player(c, s.player, time);
      c.restore();
      if (s.red && !options.reduced) damageEdges(c, w, h, s.red);
      if (options.touches) sticks(c, options.touches, w, h);
      if (options.aim) crosshair(c, options.aim.x, options.aim.y);
    };
  }

  return { renderer };
})();
