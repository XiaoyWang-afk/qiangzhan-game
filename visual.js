'use strict';

const Visual = (() => {
  const { TAU, guns, types } = Arena;
  const cyan = '#68f7df';
  const violet = '#ad87ff';

  function path(c, points, close = true) {
    c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    if (close) c.closePath();
  }

  function circle(c, x, y, r) {
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
  }

  function poly(c, sides, r, angle = 0) {
    path(c, Array.from({ length: sides }, (_, i) => [Math.cos(angle + i * TAU / sides) * r, Math.sin(angle + i * TAU / sides) * r]));
  }

  function painted(c, fill, stroke, width = 1.4) {
    c.fillStyle = fill;
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.fill();
    c.stroke();
  }

  function makeFloor(w, h) {
    const floor = document.createElement('canvas');
    floor.width = Math.ceil(w);
    floor.height = Math.ceil(h);
    const c = floor.getContext('2d');
    const wx = w / 2;
    const hy = h / 2;
    const g = c.createRadialGradient(wx, hy, 5, wx, hy, Math.max(wx, hy));
    g.addColorStop(0, '#252043');
    g.addColorStop(.55, '#17162b');
    g.addColorStop(1, '#100f1e');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.lineWidth = 1;
    for (let x = wx % 33; x < w; x += 33) {
      c.strokeStyle = Math.round((x - wx) / 33) % 4 ? '#9b80e614' : '#9b80e631';
      path(c, [[x, 0], [x, h]], false);
      c.stroke();
    }
    for (let y = hy % 33; y < h; y += 33) {
      c.strokeStyle = Math.round((y - hy) / 33) % 4 ? '#9b80e614' : '#9b80e631';
      path(c, [[0, y], [w, y]], false);
      c.stroke();
    }
    c.strokeStyle = '#9c76ef51';
    const pad = 27;
    const bevel = 40;
    path(c, [[pad + bevel, pad], [w - pad - bevel, pad], [w - pad, pad + bevel], [w - pad, h - pad - bevel], [w - pad - bevel, h - pad], [pad + bevel, h - pad], [pad, h - pad - bevel], [pad, pad + bevel]]);
    c.stroke();

    c.save();
    c.translate(wx, hy);
    const r = Math.min(w, h) * .32;
    c.strokeStyle = '#a483ec39';
    poly(c, 8, r, Math.PI / 8);
    c.stroke();
    circle(c, 0, 0, r * .65);
    c.stroke();
    c.setLineDash([2, 8]);
    circle(c, 0, 0, r * .74);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = '#a483ec57';
    path(c, [[-r * .9, 0], [r * .9, 0]], false);
    c.stroke();
    path(c, [[0, -r * .9], [0, r * .9]], false);
    c.stroke();
    c.restore();

    for (const [x, y] of [[.2, .23], [.8, .23], [.2, .77], [.8, .77]]) {
      c.save();
      c.translate(x * w, y * h);
      c.strokeStyle = '#8766d850';
      poly(c, 6, 31);
      c.stroke();
      poly(c, 6, 23);
      painted(c, '#211a38', '#8766d847');
      c.fillStyle = '#a183e598';
      c.fillRect(-12, -1, 24, 2);
      c.fillRect(-1, -7, 2, 14);
      c.restore();
    }
    for (const x of [.15, .85]) {
      for (const y of [.075, .925]) {
        for (let i = 0; i < 5; i++) {
          c.fillStyle = i % 2 ? '#9a75e43e' : '#9a75e473';
          c.fillRect(w * x + (i - 2) * 9, h * y, 6, 2);
        }
      }
    }
    return floor;
  }

  function player(c, p, elapsed) {
    c.save();
    c.translate(p.x, p.y);
    c.globalAlpha = p.shield && Math.sin(elapsed * 46) < 0 ? .48 : 1;
    c.strokeStyle = '#68f7df66';
    c.lineWidth = 1;
    circle(c, 0, 0, 23);
    c.stroke();
    c.rotate(p.angle);
    c.shadowBlur = 15;
    c.shadowColor = cyan;
    path(c, [[15, 0], [1, 11], [-12, 8], [-7, 0], [-12, -8], [1, -11]]);
    painted(c, '#193c49', cyan, 2);
    c.shadowBlur = 0;
    c.fillStyle = '#d0fff7';
    c.fillRect(-2, -3, 7, 6);
    c.fillStyle = cyan;
    c.fillRect(12, -2, 10, 4);
    c.fillStyle = '#74f3e88e';
    c.fillRect(-19, -5, 4, 2);
    c.fillRect(-19, 3, 4, 2);
    if (p.flash > 0) {
      c.shadowBlur = 16;
      c.shadowColor = guns[p.slot].color;
      c.fillStyle = guns[p.slot].color;
      path(c, [[21, 0], [26, -7], [43, 0], [26, 7]]);
      c.fill();
    }
    c.restore();
  }

  function drone(c, e, elapsed) {
    const t = types[e.kind];
    c.save();
    c.translate(e.x, e.y);
    if (e.warm > 0) {
      c.globalAlpha = 1 - e.warm * 1.3;
      c.strokeStyle = t.color;
      c.setLineDash([3, 4]);
      circle(c, 0, 0, e.r + e.warm * 27);
      c.stroke();
      c.setLineDash([]);
    }
    c.rotate(e.angle);
    c.shadowColor = t.color;
    c.shadowBlur = e.kind === 'boss' ? 21 : 12;
    if (e.kind === 'dash') path(c, [[14, 0], [-6, 9], [-11, 0], [-6, -9]]);
    else poly(c, e.kind === 'boss' ? 8 : e.kind === 'gunner' ? 6 : 4, e.r);
    painted(c, e.hit > 0 ? '#fff1fb' : '#301a37', t.color, e.kind === 'boss' ? 2.4 : 1.65);
    c.shadowBlur = 0;
    if (e.kind === 'gunner' || e.kind === 'boss') {
      c.strokeStyle = t.color;
      const r = e.r * .63;
      c.strokeRect(-r, -r, r * 2, r * 2);
      c.fillStyle = t.color;
      c.fillRect(e.r * .75, -2, e.r * .42, 4);
    }
    c.fillStyle = t.color;
    circle(c, 0, 0, (e.kind === 'boss' ? 6 : 3) + Math.sin(elapsed * 8) * .65);
    c.fill();
    c.rotate(-e.angle);
    if (e.hp < e.max || e.kind === 'boss') {
      c.fillStyle = '#2b203d';
      c.fillRect(-e.r, -e.r - 10, e.r * 2, 3);
      c.fillStyle = t.color;
      c.fillRect(-e.r, -e.r - 10, e.r * 2 * e.hp / e.max, 3);
    }
    c.restore();
  }

  function pickup(c, d, time) {
    const color = d.kind === 'health' ? cyan : d.kind === 'ammo' ? '#ffd094' : violet;
    c.save();
    c.translate(d.x, d.y + Math.sin(time * 4 + d.x) * 3);
    if (d.life < 3) c.globalAlpha = .5 + .5 * Math.sin(time * 13) ** 2;
    c.shadowBlur = 15;
    c.shadowColor = color;
    poly(c, 4, 14);
    painted(c, '#24213d', color);
    c.shadowBlur = 0;
    c.fillStyle = color;
    if (d.kind === 'health') {
      c.fillRect(-2, -6, 4, 12);
      c.fillRect(-6, -2, 12, 4);
    } else if (d.kind === 'ammo') {
      for (let i = -5; i <= 5; i += 5) c.fillRect(i - 1, -4, 3, 8);
    } else {
      c.fillRect(-6, -4, 12, 4);
      c.fillRect(-4, 0, 4, 5);
    }
    c.restore();
  }

  function crosshair(c, x, y) {
    c.strokeStyle = cyan;
    c.lineWidth = 1.2;
    circle(c, x, y, 7);
    c.stroke();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      path(c, [[x + Math.cos(a) * 9, y + Math.sin(a) * 9], [x + Math.cos(a) * 14, y + Math.sin(a) * 14]], false);
      c.stroke();
    }
  }

  function sticks(c, touches, w, h) {
    c.lineWidth = 1.2;
    for (const [role, color, pos] of [['move', cyan, .16], ['aim', violet, .84]]) {
      const t = touches[role];
      const x = t?.ox ?? w * pos;
      const y = t?.oy ?? h * .78;
      c.globalAlpha = t ? .75 : .26;
      c.strokeStyle = color;
      c.fillStyle = '#141128b3';
      circle(c, x, y, 41);
      c.fill();
      c.stroke();
      const dx = (t?.x ?? x) - x;
      const dy = (t?.y ?? y) - y;
      const scale = Math.min(1, 31 / (Math.hypot(dx, dy) || 1));
      c.fillStyle = color;
      circle(c, x + dx * scale, y + dy * scale, 8);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  function renderer(c) {
    let floor;
    return (s, options) => {
      const { w, h } = s;
      const time = options.time;
      if (!floor || floor.width !== Math.ceil(w) || floor.height !== Math.ceil(h)) floor = makeFloor(w, h);
      c.fillStyle = '#11101e';
      c.fillRect(0, 0, w, h);
      c.save();
      const n = options.reduced ? 0 : s.shake;
      if (n) c.translate((Math.random() - .5) * n, (Math.random() - .5) * n);
      c.drawImage(floor, 0, 0, w, h);

      if (options.demo) {
        for (const [x, y, kind] of [[.15, .45, 'gunner'], [.25, .67, 'dash'], [.82, .35, 'boss'], [.72, .66, 'scout'], [.89, .73, 'gunner']]) {
          const t = types[kind];
          drone(c, { x: w * x, y: h * y + Math.sin(time * .9 + x * 7) * 7, kind, angle: Math.atan2(.5 - y, .5 - x), hp: t.hp, max: t.hp, r: t.r }, time);
        }
        for (const [x, y, color] of [[.12, .58, '#ff91c3'], [.22, .31, cyan], [.34, .79, violet], [.66, .25, cyan], [.78, .56, '#ff91c3'], [.86, .49, violet]]) {
          c.strokeStyle = color;
          c.lineWidth = 2;
          c.globalAlpha = .3 + .32 * Math.sin(time * 2 + x * 34) ** 2;
          const left = w * x + Math.sin(time * .8 + x * 10) * 13;
          path(c, [[left, h * y], [left + 16, h * y - 5]], false);
          c.stroke();
        }
        c.globalAlpha = 1;
      }
      for (const r of s.rings) {
        c.globalAlpha = r.life / r.max * .78;
        c.strokeStyle = r.color;
        c.lineWidth = 1.5;
        circle(c, r.x, r.y, Math.max(1, (1 - r.life / r.max) * r.radius));
        c.stroke();
      }
      c.globalAlpha = 1;
      for (const d of s.drops) pickup(c, d, time);
      for (const e of s.enemies) drone(c, e, time);
      for (const b of s.bullets) {
        c.strokeStyle = b.color;
        c.lineWidth = b.enemy ? 2 : 2.5;
        c.shadowColor = b.color;
        c.shadowBlur = 9;
        path(c, [[b.x - Math.cos(b.a) * 12, b.y - Math.sin(b.a) * 12], [b.x, b.y]], false);
        c.stroke();
        c.fillStyle = b.color;
        circle(c, b.x, b.y, b.r);
        c.fill();
      }
      c.shadowBlur = 0;
      for (const p of s.sparks) {
        c.globalAlpha = p.life / p.max;
        c.fillStyle = p.color;
        c.fillRect(p.x, p.y, 2.5, 2.5);
      }
      c.globalAlpha = 1;
      if (s.player.hp > 0 && !options.demo) player(c, s.player, time);
      c.restore();

      if (s.red && !options.reduced) {
        const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .2, w / 2, h / 2, Math.max(w, h) * .65);
        g.addColorStop(0, '#ff497700');
        g.addColorStop(1, 'rgba(255, 54, 111, ' + s.red + ')');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      }
      if (options.touches) sticks(c, options.touches, w, h);
      if (options.aim) crosshair(c, options.aim.x, options.aim.y);
    };
  }

  return { renderer };
})();
