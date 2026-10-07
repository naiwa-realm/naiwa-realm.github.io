/* 奶蛙领域 · 表现特效：坐标换算、粒子、飘字、飞牌、弹道、连线、音效 */
(function (root) {
  'use strict';
  const NW = root.NW = root.NW || {};
  const $ = s => document.querySelector(s);

  const FX = {
    scale: 1, speed: 1, sound: true,
    reduced: () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    ms(t) { return FX.reduced() ? 1 : t / FX.speed; },
    wait(t) { return new Promise(r => setTimeout(r, FX.ms(t))); },
  };

  /* ---------- 舞台坐标 ---------- */
  FX.stageRect = () => $('#stage').getBoundingClientRect();
  /** 元素在舞台坐标系中的矩形（中心点准确；宽高取布局尺寸以忽略旋转） */
  FX.rect = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect(), s = FX.stageRect(), k = FX.scale;
    const w = el.offsetWidth || r.width / k, h = el.offsetHeight || r.height / k;
    const cx = (r.left + r.width / 2 - s.left) / k, cy = (r.top + r.height / 2 - s.top) / k;
    return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy };
  };
  FX.toStage = (clientX, clientY) => { const s = FX.stageRect(); return { x: (clientX - s.left) / FX.scale, y: (clientY - s.top) / FX.scale }; };

  /* ---------- 粒子 ---------- */
  const P = { list: [], running: false, ctx: null };
  function ensureCanvas() {
    if (P.ctx) return P.ctx;
    const c = $('#particles'); if (!c) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = 1600 * dpr; c.height = 900 * dpr; c.style.width = '1600px'; c.style.height = '900px';
    P.ctx = c.getContext('2d'); P.ctx.scale(dpr, dpr); return P.ctx;
  }
  function loop() {
    const ctx = ensureCanvas(); if (!ctx) return;
    ctx.clearRect(0, 0, 1600, 900);
    const now = performance.now();
    P.list = P.list.filter(p => now - p.t0 < p.life);
    for (const p of P.list) {
      const t = (now - p.t0) / p.life, dt = 1 / 60;
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      ctx.save(); ctx.globalAlpha = (1 - t) * p.a; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'shard') { ctx.beginPath(); ctx.moveTo(-p.s, -p.s * .4); ctx.lineTo(p.s, 0); ctx.lineTo(-p.s * .3, p.s * .6); ctx.closePath(); ctx.fill(); }
      else if (p.shape === 'star') { ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? p.s * .4 : p.s; const a = i * Math.PI / 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
      else { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.s); g.addColorStop(0, p.color); g.addColorStop(1, 'transparent'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.s, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    if (P.list.length) requestAnimationFrame(loop); else { P.running = false; ctx.clearRect(0, 0, 1600, 900); }
  }
  FX.burst = (x, y, o = {}) => {
    if (FX.reduced()) return;
    const n = o.n || 18;
    for (let i = 0; i < n; i++) {
      const a = (o.angle != null ? o.angle : Math.random() * Math.PI * 2) + (Math.random() - .5) * (o.spread != null ? o.spread : Math.PI * 2);
      const v = (o.speed || 220) * (.4 + Math.random() * .8);
      P.list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: o.gravity != null ? o.gravity : 380, drag: o.drag || .96, s: (o.size || 6) * (.6 + Math.random() * .8), color: Array.isArray(o.color) ? o.color[i % o.color.length] : (o.color || '#ffe9a6'), life: (o.life || 700) * (.7 + Math.random() * .6) / FX.speed, t0: performance.now(), a: o.alpha || 1, shape: o.shape || 'dot', rot: Math.random() * 6, vr: (Math.random() - .5) * 12 });
    }
    if (!P.running) { P.running = true; requestAnimationFrame(loop); }
  };
  FX.shatter = (x, y, color) => { FX.burst(x, y, { n: 26, speed: 340, size: 9, shape: 'shard', color: [color || '#e9dcb6', '#b9a676', '#fff8dd'], life: 900, gravity: 700 }); FX.burst(x, y, { n: 14, speed: 120, size: 22, color: '#ffffff55', gravity: -30, life: 600 }); };
  FX.sparkle = (x, y, color) => FX.burst(x, y, { n: 14, speed: 140, size: 7, shape: 'star', color: color || '#ffe9a6', gravity: -60, life: 800 });

  /* ---------- 飘字 ---------- */
  FX.float = (x, y, text, cls = 'txt', o = {}) => {
    const el = document.createElement('div'); el.className = 'float ' + cls; el.innerHTML = text;
    if (o.bg) { el.style.background = o.bg; el.style.color = '#1b160b'; }
    el.style.left = x + 'px'; el.style.top = y + 'px';
    $('#fx').appendChild(el);
    const dy = o.dy != null ? o.dy : -46;
    const a = el.animate([
      { transform: 'translate(-50%,-50%) scale(.5)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: .18 },
      { transform: `translate(-50%,calc(-50% + ${dy * .6}px)) scale(1)`, opacity: 1, offset: .7 },
      { transform: `translate(-50%,calc(-50% + ${dy}px)) scale(.95)`, opacity: 0 }], { duration: FX.ms(o.dur || 1100), easing: 'ease-out' });
    a.onfinish = () => el.remove();
    return a.finished.catch(() => {});
  };

  /* ---------- 飞行的小光球（资源 / 攻击） ---------- */
  FX.orb = (from, to, color, o = {}) => new Promise(resolve => {
    if (!from || !to) return resolve();
    if (FX.reduced()) return resolve();
    const el = document.createElement('div');
    const size = o.size || 16;
    Object.assign(el.style, { position: 'absolute', left: '0', top: '0', width: size + 'px', height: size + 'px', borderRadius: '50%', background: `radial-gradient(circle at 35% 30%,#fff,${color} 55%,transparent 72%)`, boxShadow: `0 0 ${size}px ${color}`, pointerEvents: 'none' });
    $('#fx').appendChild(el);
    const mx = (from.x + to.x) / 2 + (o.arc != null ? o.arc : (Math.random() - .5) * 120), my = Math.min(from.y, to.y) - (o.lift != null ? o.lift : 80);
    const dur = FX.ms(o.dur || 520), t0 = performance.now();
    const trail = o.trail !== false;
    (function step(now) {
      const t = Math.min(1, (now - t0) / dur), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const x = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * mx + e * e * to.x;
      const y = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * my + e * e * to.y;
      el.style.transform = `translate(${x - size / 2}px,${y - size / 2}px)`;
      if (trail && Math.random() < .6) P.list.push({ x, y, vx: 0, vy: 0, g: 0, drag: 1, s: size * .55, color, life: 260, t0: now, a: .7, shape: 'dot', rot: 0, vr: 0 });
      if (!P.running && trail) { P.running = true; requestAnimationFrame(loop); }
      if (t < 1) requestAnimationFrame(step); else { el.remove(); resolve(); }
    })(t0);
  });

  /* ---------- 卡牌幽灵（飞向牌堆 / 焚毁） ---------- */
  FX.ghost = (el, rect) => {
    const g = el.cloneNode(true);
    g.classList.add('fx-ghost'); g.classList.remove('selectable', 'playable', 'ally-ready', 'dragging', 'ghost');
    g.removeAttribute('data-uid');
    Object.assign(g.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px', transform: 'none', zIndex: 5 });
    if (g.classList.contains('card')) { g.style.setProperty('--cw', rect.w + 'px'); g.style.height = (rect.w * 1.4) + 'px'; g.style.top = (rect.cy - rect.w * .7) + 'px'; }
    $('#fx').appendChild(g); return g;
  };
  FX.flyGhost = (el, from, to, o = {}) => {
    if (!el || !from || !to) return Promise.resolve();
    const g = FX.ghost(el, from);
    const s = Math.min(to.w / from.w, to.h / from.h);
    const dx = to.cx - from.cx, dy = to.cy - from.cy;
    const mid = o.lift ? `translate(${dx * .5}px,${dy * .5 - o.lift}px) scale(${(1 + s) / 2}) rotate(${o.spin || 0}deg)` : null;
    const frames = [{ transform: 'none', opacity: 1 }];
    if (mid) frames.push({ transform: mid, opacity: 1, offset: .5 });
    frames.push({ transform: `translate(${dx}px,${dy}px) scale(${s}) rotate(${o.spin ? o.spin * 2 : 0}deg)`, opacity: o.fade === false ? 1 : .2 });
    const a = g.animate(frames, { duration: FX.ms(o.dur || 520), delay: FX.ms(o.delay || 0), easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'both' });
    return a.finished.catch(() => {}).then(() => g.remove());
  };
  FX.burn = (el, rect) => {
    if (!el || !rect) return Promise.resolve();
    const g = FX.ghost(el, rect);
    const a = g.animate([{ filter: 'brightness(1) sepia(0)', opacity: 1, transform: 'none' }, { filter: 'brightness(1.8) sepia(1) hue-rotate(-20deg)', opacity: 1, transform: 'scale(1.05)', offset: .4 }, { filter: 'brightness(.2) sepia(1)', opacity: 0, transform: 'scale(.85) translateY(-20px)' }], { duration: FX.ms(800), easing: 'ease-in', fill: 'both' });
    FX.burst(rect.cx, rect.cy, { n: 30, speed: 160, size: 9, color: ['#ff9a3c', '#ffcf5a', '#ff5a2a'], gravity: -260, life: 900 });
    return a.finished.catch(() => {}).then(() => g.remove());
  };

  /* ---------- 连线（联动） ---------- */
  FX.link = (a, b, color) => {
    if (!a || !b || FX.reduced()) return;
    const svg = $('#arrows'); const ns = 'http://www.w3.org/2000/svg';
    const path = document.createElementNS(ns, 'path');
    const mx = (a.cx + b.cx) / 2, my = Math.min(a.cy, b.cy) - 50;
    path.setAttribute('d', `M${a.cx},${a.cy} Q${mx},${my} ${b.cx},${b.cy}`);
    Object.assign(path.style, { fill: 'none', stroke: color, strokeWidth: 5, strokeLinecap: 'round', filter: `drop-shadow(0 0 8px ${color})`, strokeDasharray: '6 10' });
    svg.appendChild(path);
    const len = path.getTotalLength();
    path.animate([{ strokeDashoffset: len, opacity: 0 }, { strokeDashoffset: 0, opacity: 1, offset: .3 }, { strokeDashoffset: -len * .5, opacity: 0 }], { duration: FX.ms(1000), easing: 'ease-out' }).onfinish = () => path.remove();
  };

  /* ---------- 瞄准箭头 ---------- */
  FX.arrow = {
    el: null,
    show(from, to, ok) {
      const svg = $('#arrows'); const ns = 'http://www.w3.org/2000/svg';
      if (!this.el) {
        this.el = document.createElementNS(ns, 'g');
        this.el.innerHTML = '<path class="ar-body" fill="none" stroke-linecap="round"/><path class="ar-head"/>';
        svg.appendChild(this.el);
      }
      const body = this.el.querySelector('.ar-body'), head = this.el.querySelector('.ar-head');
      const color = ok ? '#ff7a52' : '#9aa59a';
      const mx = (from.x + to.x) / 2, my = Math.min(from.y, to.y) - Math.min(120, Math.abs(to.x - from.x) * .12) - 30;
      body.setAttribute('d', `M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}`);
      Object.assign(body.style, { stroke: color, strokeWidth: 10, strokeDasharray: '2 16', filter: `drop-shadow(0 0 6px ${color})` });
      const ang = Math.atan2(to.y - my, to.x - mx);
      const p = (r, a) => `${to.x + Math.cos(ang + a) * r},${to.y + Math.sin(ang + a) * r}`;
      head.setAttribute('d', `M${p(8, 0)} L${p(30, 2.6)} L${p(14, Math.PI)} L${p(30, -2.6)} Z`);
      head.style.fill = color; head.style.filter = `drop-shadow(0 0 6px ${color})`;
    },
    hide() { if (this.el) { this.el.remove(); this.el = null; } },
  };

  /* ---------- 横幅 ---------- */
  FX.banner = (text, sub, cls = '') => {
    const el = document.createElement('div'); el.className = 'banner ' + cls;
    el.innerHTML = `<div class="band"></div><b>${text}</b>${sub ? `<small>${sub}</small>` : ''}`;
    $('#stage').appendChild(el);
    const a = el.animate([{ opacity: 0, transform: 'scaleY(.2)' }, { opacity: 1, transform: 'scaleY(1)', offset: .15 }, { opacity: 1, transform: 'scaleY(1)', offset: .8 }, { opacity: 0, transform: 'scaleY(.6)' }], { duration: FX.ms(1300), easing: 'ease-out' });
    a.onfinish = () => el.remove();
    return FX.wait(700);
  };

  FX.toast = (text, kind = '') => {
    const box = $('#toast'); if (!box) return;
    const el = document.createElement('div'); el.className = kind; el.innerHTML = text; box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, 2200);
  };

  FX.shake = (el, cls = 'hit') => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 450); };
  FX.screenShake = (power = 8) => {
    if (FX.reduced()) return;
    const t = $('.table'); if (!t) return;
    t.animate([{ transform: 'none' }, { transform: `translate(${power}px,${-power / 2}px)` }, { transform: `translate(${-power}px,${power / 3}px)` }, { transform: `translate(${power / 2}px,${power / 2}px)` }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
  };

  /* ---------- 合成音效（WebAudio，无需音频文件） ---------- */
  let AC = null, unlocked = false;
  const unlock = () => { unlocked = true; };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
  function ac() { if (!unlocked) return null; if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
  function tone(freq, dur, type = 'sine', vol = .08, when = 0, slide = 0) {
    const a = ac(); if (!a) return; const t = a.currentTime + when;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
  }
  function noise(dur, vol = .06, freq = 2000, when = 0, q = 1) {
    const a = ac(); if (!a) return; const t = a.currentTime + when;
    const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
    src.buffer = buf; src.connect(f).connect(g).connect(a.destination); src.start(t);
  }
  const SFX = {
    card: () => noise(.12, .09, 3200, 0, .7),
    buy: () => { noise(.1, .07, 2600); tone(1320, .12, 'sine', .05, .04); tone(1760, .16, 'sine', .04, .1); },
    coin: () => { tone(1500, .09, 'sine', .045); tone(2100, .12, 'sine', .035, .05); },
    energy: () => tone(660, .16, 'triangle', .05, 0, 1.6),
    power: () => tone(180, .16, 'square', .04, 0, .6),
    heal: () => { tone(880, .2, 'sine', .04); tone(1320, .25, 'sine', .03, .08); },
    hit: () => { noise(.25, .14, 500, 0, .6); tone(110, .3, 'sine', .12, 0, .4); },
    shatter: () => { noise(.4, .12, 3600, 0, 2); noise(.3, .08, 900, .05); },
    ally: () => { tone(660, .12, 'triangle', .05); tone(830, .12, 'triangle', .05, .07); tone(990, .2, 'triangle', .05, .14); },
    scrap: () => { noise(.5, .08, 1200, 0, .5); tone(300, .4, 'sawtooth', .025, 0, .4); },
    turn: () => { tone(523, .25, 'sine', .05); tone(784, .35, 'sine', .04, .12); },
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, .35, 'triangle', .06, i * .12)),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, .45, 'sine', .06, i * .18)),
    bad: () => tone(160, .12, 'square', .03),
    shuffle: () => { for (let i = 0; i < 5; i++) noise(.06, .05, 2800, i * .04); },
  };
  FX.sfx = name => { if (!FX.sound || !SFX[name]) return; try { SFX[name](); } catch (e) { /* 忽略 */ } };

  NW.FX = FX;
})(window);
