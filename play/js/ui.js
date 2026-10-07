/* 奶蛙领域 · 牌桌界面
 * 渲染只读 view（engine.view），动作通过 session.submit 提交。
 * 每张卡牌实例对应唯一 DOM 元素（data-uid），在区域间移动时用 FLIP 动画补间；
 * 引擎事件（events）驱动飘字、弹道、联动连线等特效。
 */
(function (root) {
  'use strict';
  const NW = root.NW = root.NW || {};
  const FX = NW.FX, CARDS = NW.CARDS, FACTIONS = NW.FACTIONS, TYPES = NW.TYPES;
  const $ = s => document.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- 美术与文本 ---------------- */
  const ART = {
    egg: { h: '88%' }, baby: { h: '94%' }, laugh: { h: '100%', b: '0%' }, kungfu: { h: '92%' }, frenzy: { h: '100%', b: '0%' }, hold: { h: '100%', b: '0%' },
    sigma: { h: '97%', b: '0%' }, sleeper: { h: '100%', b: '0%' }, scholar: { h: '102%', b: '0%' }, cat: { h: '82%' }, king: { h: '102%', b: '0%' },
    rocket: { h: '94%', b: '2%' }, chieftain: { h: '98%', b: '0%' }, guard: { photo: '58% 18%' }, angel: { h: '96%', b: '0%' },
    gate: { photo: '50% 30%' }, army: { photo: '42% 40%' }, nolaugh: { h: '100%', b: '0%' }, disdain: { h: '100%', b: '0%', x: '8%' },
  };
  // 单文件打包时 NW.ART_DATA 内联为 data URI；否则走 assets/art/ 目录
  const artSrc = (key, photo) => { const f = `${key}${photo ? '_photo' : ''}.webp`; return (NW.ART_DATA && NW.ART_DATA[f]) || `assets/art/${f}`; };
  function artHTML(id) {
    const c = CARDS[id], a = ART[c.art] || { h: '86%' };
    if (c.artMode === 'photo') return `<img class="art-photo" src="${artSrc(c.art, true)}" style="--ap:${a.photo || '50% 30%'}" alt="">`;
    return `<img class="art-cut" src="${artSrc(c.art)}" style="--ah:${a.h || '86%'};--ab:${a.b || '5%'};--ax:${a.x || '0%'}" alt="">`;
  }
  const PHOTO_PORTRAIT = { guard: '58% 15%' };
  const PORTRAIT_FIT = { shadowking: 'height:110%;bottom:-14%', coach: 'height:120%;bottom:-22%', md_crab: 'height:92%;bottom:2%', md_orange: 'height:96%', md_maodie: 'height:96%' }; // 抠图不完整的形象用原图做头像
  function portraitHTML(key, tint) {
    if (PHOTO_PORTRAIT[key]) return `<img src="${artSrc(key, true)}" class="photo ${tint === 'shadow' ? 'shadow' : ''}" style="object-position:${PHOTO_PORTRAIT[key]}" alt="">`;
    return `<img src="${artSrc(key)}" class="${tint === 'shadow' ? 'shadow' : ''}" style="${PORTRAIT_FIT[key] || ''}" alt="">`;
  }
  const ICON = { c: '奶蛋', e: '奶劲', p: '奶之力', h: '生命', s: '奶壳' };
  function fmt(t) { return esc(t).replace(/([+\-]?\d+)?\{([cpehs])\}/g, (m, n, k) => `<span class="ic ${k}" title="${ICON[k]}">${n || ''}<i></i></span>`); }

  function cardHTML(id, extra = '') {
    const c = CARDS[id], f = FACTIONS[c.faction];
    const t = c.text || {};
    const rows = [];
    if (t.play) { const L = t.play.replace(/\{.\}/g, '').length; rows.push(`<div class="ab play ${L <= 6 && !t.ally && !t.scrap ? 'short' : L <= 8 ? 'mid' : ''}">${fmt(t.play)}</div>`); }
    if (t.ally) rows.push(`<div class="ab ally"><span class="k">联动</span><span>${fmt(t.ally)}</span></div>`);
    if (t.scrap) rows.push(`<div class="ab scrap"><span class="k">献祭</span><span>${fmt(t.scrap)}</span></div>`);
    const badges = [];
    if (c.ally) badges.push(`<span class="badge ally" title="${f.name}联动：${esc(t.ally)}">⛓ 联动</span>`);
    if (c.scrap) badges.push(`<span class="badge scrap" data-scrap title="献祭：${esc(t.scrap)}">献祭</span>`);
    return `<div class="card f-${c.faction} t-${c.type}${c.taunt ? ' taunt' : ''}${c.fullArt ? ' full-art' : ''}" data-id="${id}" ${extra}>
      <div class="c-art">${artHTML(id)}</div>${c.fullArt ? '<div class="c-holo" title="全画幅">✦</div>' : ''}
      ${c.cost ? `<div class="c-cost">${c.cost}</div>` : ''}
      ${c.faction !== 'neutral' ? `<div class="c-fac" title="${f.name}">${f.short}</div>` : ''}
      ${c.taunt ? '<div class="c-taunt">嘲讽</div>' : ''}
      <div class="c-name">${esc(c.name)}</div>
      <div class="c-type">${TYPES[c.type]}${c.kind ? '·' + NW.STATUS_KINDS[c.kind].name : ''}${c.faction !== 'neutral' ? ' · ' + f.name : ''}</div>
      <div class="c-text">${rows.join('')}</div>
      ${c.type === 'statue' ? `<div class="c-hp">${c.hp}</div>` : ''}
      <div class="c-badges">${badges.join('')}</div>
      ${c.flavor ? `<div class="c-flavor">${esc(c.flavor)}</div>` : ''}
      <div class="c-backface"></div>
    </div>`;
  }
  function makeCard(id, uid) {
    const w = document.createElement('div'); w.innerHTML = cardHTML(id, uid ? `data-uid="${uid}"` : '');
    return w.firstElementChild;
  }

  /* ---------------- 状态 ---------------- */
  const UI = {
    session: null, viewer: 0, view: null, mode: 'ai', opts: {},
    els: new Map(), disp: null, queue: [], busy: false,
    drag: null, aim: null, replaceFor: null, scrapArm: null, endArm: 0,
    hooks: {}, waiters: [],
  };
  NW.UI = UI;
  UI.cardHTML = cardHTML; UI.makeCard = makeCard; UI.fmt = fmt; UI.portraitHTML = portraitHTML; UI.artSrc = artSrc;

  const me = () => UI.view.seats[UI.viewer];
  const op = () => UI.view.seats[1 - UI.viewer];
  const isMine = seat => seat === UI.viewer;
  const myTurn = () => { const v = UI.view; return v && !v.over && !v.pending && v.active === UI.viewer && UI.isHuman(UI.viewer); };
  const myChoice = () => { const v = UI.view; return v && v.pending && v.pending.seat === UI.viewer && UI.isHuman(UI.viewer); };
  UI.isHuman = seat => UI.session && UI.session.controllers[seat] instanceof NW.Net.HumanController;
  const can = a => UI.session && !UI.session.check(Object.assign({ seat: UI.viewer }, a));

  /* ---------------- 启动对局 ---------------- */
  /**
   * @param {object} o { session, viewer, mode:'ai'|'pve'|'hotseat'|'online', title, level, link, onExit, onRematch, onNext }
   */
  UI.start = function (o) {
    UI.stop();
    UI.opts = o; UI.session = o.session; UI.viewer = o.viewer || 0; UI.mode = o.mode || 'ai';
    UI.els.clear(); UI.queue = []; UI.replaceFor = null; UI.scrapArm = null; UI.view = null; UI.endArm = 0;
    NW.Screens.show('game');
    $('#modeChip').textContent = o.title || '对局';
    $('#screen-game').classList.toggle('mode-pve', UI.mode === 'pve');
    $('#hero-op').classList.toggle('elite', !!(o.level && NW.Campaign.isElite(o.level)));
    $('#emotes').classList.toggle('on', UI.mode === 'online');
    for (const id of ['#playcards', '#hand', '#market', '#errandSlot', '#limboSlot', '#statues-me', '#statues-op']) $(id).innerHTML = '';
    o.session.onUpdate = (events, action) => UI.onUpdate(events, action);
    o.session.controllers.forEach(c => { if (c instanceof NW.Net.HumanController) c.onWait = () => UI.flushQueue(); });
    o.session.onError = err => { FX.toast(err, 'bad'); FX.sfx('bad'); };
    UI.view = o.session.view(UI.viewer);
    UI.syncDisp();
    UI.render(true);
    if (NW.Coach) NW.Coach.start(o.level && o.level.tutorial);
    o.session.run().catch(e => console.error(e));
  };
  UI.stop = function () { if (UI.session) UI.session.stop(); UI.session = null; FX.arrow.hide(); if (NW.Coach) NW.Coach.stop(); };

  UI.syncDisp = function () {
    const v = UI.view;
    UI.disp = v.seats.map(s => ({ hp: s.hp, coin: s.coin, energy: s.energy, power: s.power, shield: s.shield || 0 }));
  };

  /* ---------------- 每个动作后的更新 ---------------- */
  UI.onUpdate = async function (events, action) {
    const s = UI.session; if (!s) return;
    if (NW.Coach) { NW.Coach.onEvents(events); NW.Coach.hide(); }
    if (events.some(e => e.t === 'matchStart')) {
      UI.view = s.view(UI.viewer); UI.syncDisp(); UI.render(true);
      await UI.intro();
      UI.afterUpdate(); return;
    }
    // 同屏对战：轮到另一位人类时，先演完再交接
    let switchTo = null;
    if (UI.mode === 'hotseat' && !s.state.over) { const next = s.seatToAct; if (next !== UI.viewer && UI.isHuman(next)) switchTo = next; }
    const prev = UI.view;
    UI.view = s.view(UI.viewer);
    await UI.transition(prev, UI.view, events, action);
    if (switchTo != null && UI.session === s) {
      await UI.passDevice(switchTo);
      UI.viewer = switchTo; UI.view = s.view(UI.viewer); UI.syncDisp(); UI.els.clear();
      for (const id of ['#playcards', '#hand', '#statues-me', '#statues-op', '#limboSlot']) $(id).innerHTML = '';
      UI.render(true);
      const ts = events.find(e => e.t === 'turnStart');
      if (ts) { FX.sfx('turn'); await FX.banner(`${UI.view.seats[ts.seat].name} 的回合`, `第 ${UI.view.round} 回合`); }
    }
    if (UI.view.over) { await FX.wait(500); NW.Screens.result(UI); }
    UI.afterUpdate();
  };
  UI.afterUpdate = function () {
    const w = UI.waiters; UI.waiters = []; w.forEach(r => r());
    UI.render(false);
    if (myChoice()) UI.maybeOpenPicker();
    else if (document.querySelector('#overlay .modal.picker')) NW.Screens.close(); // 选择已在别处完成
    if (NW.Coach) NW.Coach.update();
  };
  /** 人类控制器开始等待输入时，提交排队中的第一个仍然合法的动作 */
  UI.flushQueue = function () {
    if (!UI.queue.length && NW.Coach) NW.Coach.update(); // 轮到玩家输入：刷新教官提示
    while (UI.queue.length && UI.session && !UI.session.busy) {
      const a = UI.queue.shift();
      if (!UI.session.check(a)) { UI.session.submit(a); break; }
    }
  };
  UI.nextUpdate = () => new Promise(r => UI.waiters.push(r));

  UI.intro = async function () {
    const v = UI.view;
    if (UI.mode === 'pve' && UI.opts.level) { FX.sfx('turn'); await FX.banner('🎯 ' + UI.objectiveText(v).text, UI.opts.level.title); await FX.wait(700); if (UI.opts.level.tip && !UI.opts.level.tutorial) FX.toast('💡 ' + UI.opts.level.tip); }
    FX.sfx('turn');
    await FX.banner(v.active === UI.viewer && UI.mode !== 'hotseat' ? '你的回合' : `${v.seats[v.active].name} 的回合`, '第 1 回合', v.active === UI.viewer ? '' : 'op');
  };

  UI.passDevice = function (seat) {
    return new Promise(res => {
      const d = document.createElement('div'); d.className = 'pass';
      d.innerHTML = `<div class="inner"><div class="eyebrow">同屏对战 · 请交接设备</div><h2>轮到 ${esc(UI.session.state.seats[seat].name)}</h2><p>另一位玩家请移开视线。</p><div class="row-btns"><button class="btn big gold">我准备好了</button></div></div>`;
      $('#stage').appendChild(d);
      d.querySelector('button').onclick = () => { d.remove(); res(); };
    });
  };

  /* ---------------- 提交动作 ---------------- */
  UI.submit = function (a, quiet) {
    if (!UI.session) return '无对局';
    a = Object.assign({ seat: UI.viewer }, a);
    const err = UI.session.submit(a);
    if (err === '请稍候') { if (UI.queue.length < 8) UI.queue.push(a); return null; }
    if (err && !quiet) { FX.toast(err, 'bad'); FX.sfx('bad'); }
    return err;
  };

  /* ================= 渲染 ================= */
  UI.render = function (instant) {
    const v = UI.view; if (!v) return;
    renderTop(v); renderHero('me', UI.viewer); renderHero('op', 1 - UI.viewer);
    renderStatues('me', UI.viewer); renderStatues('op', 1 - UI.viewer);
    renderPlay(v); renderMarket(v); renderHand(v); renderOppHand(v); renderPiles(v);
    renderResources(); renderPending(v); renderButtons(v); renderTicker(v); renderMission(v); renderLimbo(v);
  };

  function el(uid) {
    let e = UI.els.get(uid);
    if (!e) { e = makeCard(UI.view.cards[uid], uid); UI.els.set(uid, e); }
    return e;
  }
  /** 把一组 uid 放进容器（复用元素，保持顺序） */
  const HAND_ONLY = ['ally-ready', 'playable', 'unplayable', 'selectable'];
  function place(container, uids, wrap) {
    const want = uids.map(u => el(u));
    if (container.id !== 'hand') want.forEach(e => e.classList.remove(...HAND_ONLY));
    const current = Array.from(container.children).filter(c => c.dataset && c.dataset.uid);
    current.forEach(c => { if (!want.includes(c)) c.remove(); });
    want.forEach((e, i) => { if (container.children[i] !== e) container.insertBefore(e, container.children[i] || null); });
    return want;
  }

  function renderTop(v) {
    $('#roundNo').textContent = String(v.round).padStart(2, '0');
    const who = $('#whoTurn');
    const active = v.seats[v.active];
    const mine = v.active === UI.viewer && UI.isHuman(UI.viewer);
    who.textContent = v.over ? '对局结束' : mine ? (UI.mode === 'hotseat' ? `${active.name} 的回合` : '你的回合') : `${active.name} 的回合`;
    who.classList.toggle('mine', mine && !v.over);
  }

  function renderHero(pos, seat) {
    const s = UI.view.seats[seat], d = UI.disp[seat], h = $('#hero-' + pos);
    const key = s.portrait + '|' + (s.tint || '');
    if (h.dataset.key !== key) { h.querySelector('.portrait').innerHTML = portraitHTML(s.portrait, s.tint) + '<div class="ring"></div>'; h.dataset.key = key; }
    h.querySelector('h3').textContent = s.name;
    h.querySelector('.eyebrow').textContent = pos === 'me' ? (UI.mode === 'hotseat' ? '当前玩家' : '你') : (UI.mode === 'pve' ? '关卡对手' : UI.mode === 'ai' ? '电脑对手' : '对手');
    h.querySelector('.hp b').textContent = d.hp;
    h.querySelector('.hp small').textContent = '/ ' + s.maxHp;
    const ratio = Math.max(0, Math.min(1, d.hp / s.maxHp));
    h.style.setProperty('--hp', ratio);
    h.style.setProperty('--ringc', ratio > .5 ? '#7fe08a' : ratio > .25 ? '#ffc85a' : '#ff5a5a');
    h.classList.toggle('shielded', d.shield > 0);
    const tags = [];
    if (d.shield) tags.push(`<span class="tag shield">奶壳 ${d.shield}</span>`);
    if (s.held) tags.push(`<span class="tag">憋住 ${s.held}✷</span>`);
    if (s.incomingDiscard) tags.push(`<span class="tag warn">下回合弃 ${s.incomingDiscard}</span>`);
    if (s.topdeck) tags.push('<span class="tag">下张购入置顶</span>');
    for (const g of s.guards || []) tags.push(`<span class="tag guard" title="${esc(CARDS[g.id].name)}：${esc(guardDesc(g.id))}（守势，持续到 ${esc(s.name)} 的下个回合开始）">${CARDS[g.id].name}</span>`);
    if (s.pierce) tags.push('<span class="tag pierce" title="本回合攻击无视奶壳">破壳</span>');
    if (s.nextPierce) tags.push('<span class="tag pierce" title="下回合攻击无视奶壳">下回合破壳</span>');
    h.querySelector('.tags').innerHTML = tags.join('');
    h.classList.toggle('active-turn', UI.view.active === seat && !UI.view.over);
    if (pos === 'op') {
      const taunt = s.statues.some(x => CARDS[UI.view.cards[x.uid]].taunt);
      const canHit = myTurn() && me().power > 0;
      h.classList.toggle('targetable', canHit && !taunt);
      h.classList.toggle('blocked', canHit && taunt);
      h.title = taunt ? '对方有嘲讽雕塑，必须先击破' : canHit ? `点击攻击：造成 ${me().power} 点伤害` : '';
    }
  }

  function guardDesc(id) { const g = CARDS[id].guard || {}; return g.cap ? `每回合最多失去 ${g.cap} 点生命` : g.thorns ? `对手每次攻击本体，自己受到 ${g.thorns} 点伤害` : ''; }
  UI.guardDesc = guardDesc;
  const PASSIVE_TIP = { frenzy: '之后每打出一张产生奶之力的牌 +1 奶之力', sigma: '之后每打出一张产生奶劲的牌 +1 奶劲', army: '之后每打出一张角色牌 +1 奶之力', gate: '每删除一张自己的牌 +1 奶蛋', hold: '回合结束时保存未用完的奶之力，下回合破壳' };
  function statusChip(id) { const c = CARDS[id], k = c.kind ? NW.STATUS_KINDS[c.kind] : null; return `<span class="tag st-${c.kind || 'buff'}" title="${esc(c.name)}：${esc(PASSIVE_TIP[c.passive] || (c.guard ? guardDesc(id) : ''))}">${k ? k.name + '·' : ''}${esc(c.name)}</span>`; }

  function renderStatues(pos, seat) {
    const box = $('#statues-' + pos), s = UI.view.seats[seat], lim = UI.view.rules.statueLimit;
    while (box.children.length < lim) { const d = document.createElement('div'); d.className = 'statue-slot'; box.appendChild(d); }
    const slots = Array.from(box.children);
    const want = s.statues.map(x => x.uid);
    // 先移除不在场的
    slots.forEach(sl => { const c = sl.querySelector('.card'); if (c && !want.includes(c.dataset.uid)) c.remove(); });
    s.statues.forEach((x, i) => {
      const e = el(x.uid), sl = slots[i];
      e.classList.remove(...HAND_ONLY);
      if (e.parentNode !== sl) { const old = sl.querySelector('.card'); if (old && old !== e) old.remove(); sl.appendChild(e); }
      const hpEl = e.querySelector('.c-hp'); if (hpEl) hpEl.textContent = x.hp;
      e.dataset.hp = x.hp;
      const enemy = pos === 'op';
      const pd = UI.view.pending;
      const destroyPick = myChoice() && pd.kind === 'destroyStatue' && (pd.options || []).includes(x.uid);
      const canHit = enemy && myTurn() && me().power > 0;
      e.classList.toggle('targetable', (canHit && me().power >= x.hp) || destroyPick);
      e.classList.toggle('too-strong', canHit && me().power < x.hp && !destroyPick);
      e.classList.toggle('replace-pick', !enemy && !!UI.replaceFor);
      e.title = destroyPick ? '点击击碎' : canHit ? (me().power >= x.hp ? `消耗 ${x.hp} 奶之力击碎` : `需要 ${x.hp} 奶之力`) : '';
    });
    slots.forEach((sl, i) => sl.classList.toggle('filled', i < s.statues.length));
  }

  function renderPlay(v) {
    const owner = v.seats[v.active];
    const box = $('#playcards');
    const cards = place(box, owner.played);
    let hint = box.querySelector('.empty-hint');
    if (!owner.played.length) { if (!hint) { hint = document.createElement('div'); hint.className = 'empty-hint'; box.appendChild(hint); } hint.textContent = isMine(v.active) && UI.isHuman(v.active) ? '把手牌拖到这里，或直接点击打出' : '本回合打出的牌会出现在这里'; }
    else if (hint) hint.remove();
    cards.forEach(e => {
      const uid = e.dataset.uid, c = CARDS[v.cards[uid]];
      const lit = !!owner.allyDone[uid];
      const b = e.querySelector('.badge.ally'); if (b) { b.classList.toggle('lit', lit); b.textContent = lit ? '⛓ 已联动' : '⛓ 待联动'; }
      const ab = e.querySelector('.ab.ally'); if (ab) { ab.classList.toggle('lit', lit); ab.classList.toggle('dim', !lit); }
      const sb = e.querySelector('.badge.scrap');
      if (sb) { const ok = isMine(v.active) && myTurn() && !!c.scrap; sb.style.display = ok ? '' : 'none'; sb.classList.toggle('confirm', UI.scrapArm === uid); sb.textContent = UI.scrapArm === uid ? '确认献祭？' : '献祭'; }
      e.classList.toggle('mine', isMine(v.active));
    });
    $('#playOwner').textContent = owner.name;
    $('#statusChips').innerHTML = owner.status.map(statusChip).join('');
  }

  function renderMarket(v) {
    const box = $('#market');
    // 市场五格：每格一个 slot 容器
    while (box.children.length < v.market.length) { const d = document.createElement('div'); d.className = 'slot'; d.style.left = (box.children.length * 156) + 'px'; d.dataset.slot = box.children.length; box.appendChild(d); }
    const affordable = myTurn();
    v.market.forEach((uid, i) => {
      const sl = box.children[i];
      const cur = sl.querySelector('.card');
      if (!uid) { if (cur) cur.remove(); return; }
      const e = el(uid);
      if (cur !== e) { if (cur) cur.remove(); sl.appendChild(e); }
      e.classList.remove(...HAND_ONLY);
      styleBuyable(e, v.cards[uid], affordable);
      e.dataset.slot = i;
    });
    // 常驻
    const es = $('#errandSlot');
    let pe = es.querySelector('.card');
    if (!pe) { pe = makeCard('errand'); pe.dataset.perm = 'errand'; es.appendChild(pe); }
    styleBuyable(pe, 'errand', affordable);
    $('#supplyN').textContent = v.supplyCount;
  }
  function styleBuyable(e, id, affordable) {
    const cost = UI.view.costs[id], base = CARDS[id].cost;
    const ce = e.querySelector('.c-cost'); if (ce) { ce.textContent = cost; ce.classList.toggle('cheap', cost < base); ce.classList.toggle('pricey', cost > base); }
    e.classList.toggle('cant-afford', !affordable || UI.disp[UI.viewer].coin < cost);
    const et = UI.view.rules.eliteTrashCost; e.classList.toggle('elite', !!et && !CARDS[id].permanent && base >= et);
    // 阵营计数提示
    const f = CARDS[id].faction;
    if (f !== 'neutral') {
      const n = countFaction(UI.viewer, f);
      e.title = `${FACTIONS[f].name}：你的牌组中已有 ${n} 张`;
    }
  }
  function countFaction(seat, f) {
    const s = UI.view.seats[seat];
    const ids = [].concat((s.hand || []).map(u => UI.view.cards[u]), s.discard.map(u => UI.view.cards[u]), s.played.map(u => UI.view.cards[u]), s.statues.map(x => UI.view.cards[x.uid]), s.deckList || []);
    return ids.filter(id => id && CARDS[id].faction === f).length;
  }

  function renderHand(v) {
    const box = $('#hand'), s = me();
    const hand = s.hand || [];
    const cards = place(box, hand);
    let empty = box.querySelector('.hand-empty');
    if (!hand.length) { if (!empty) { empty = document.createElement('div'); empty.className = 'hand-empty'; box.appendChild(empty); } empty.textContent = myTurn() ? '手牌已打完：去市场购买、拖动奶之力攻击，或结束回合' : ''; }
    else if (empty) empty.remove();
    const W = 1268, cw = 140, n = cards.length; // 手牌区宽度（table 1568 - 左右各 150）
    const gap = n > 1 ? Math.min(150, (W - cw) / (n - 1)) : 0;
    const total = cw + gap * (n - 1), x0 = (W - total) / 2;
    const presence = new Set(s.played.concat(s.statues.map(x => x.uid)).map(u => CARDS[v.cards[u]].faction));
    const pd = v.pending;
    cards.forEach((e, i) => {
      const off = i - (n - 1) / 2;
      e.style.setProperty('--x', (x0 + gap * i) + 'px');
      e.style.setProperty('--rot', Math.max(-14, Math.min(14, off * 3.2)) + 'deg');
      e.style.setProperty('--dy', (off * off * 2.4) + 'px');
      e.style.setProperty('--z', i + 1);
      const uid = e.dataset.uid, c = CARDS[v.cards[uid]];
      const selectable = myChoice() && (pd.options || []).includes(uid) && pd.zones[uid] === 'hand';
      e.classList.toggle('selectable', selectable);
      e.classList.toggle('playable', myTurn() && !selectable);
      e.classList.toggle('unplayable', !myTurn() && !selectable);
      e.classList.toggle('ally-ready', myTurn() && !!c.ally && c.faction !== 'neutral' && presence.has(c.faction));
    });
  }

  function renderOppHand(v) {
    const box = $('#oppHand'), n = op().handCount;
    const backs = box.querySelectorAll('.back');
    if (backs.length !== Math.min(n, 9)) {
      const m = Math.min(n, 9);
      box.innerHTML = Array.from({ length: m }, (_, i) => { const off = i - (m - 1) / 2; return `<div class="back" style="--r:${off * 7}deg;--y:${Math.abs(off) * 3}px"></div>`; }).join('') + `<span class="count">手牌 ${n}</span>`;
    } else { const c = box.querySelector('.count'); if (c) c.textContent = '手牌 ' + n; }
  }

  function pileHTML(seat, kind) {
    const s = UI.view.seats[seat];
    const n = kind === 'deck' ? s.deckCount : s.discard.length;
    let inner;
    if (!n) inner = '<div class="empty"></div>';
    else if (kind === 'deck') inner = `<div class="stack">${Array.from({ length: Math.min(5, Math.ceil(n / 3)) }, (_, i) => `<i class="back" style="transform:translate(${-i * 1.5}px,${-i * 2}px)"></i>`).join('')}</div>`;
    else { const top = s.discard[s.discard.length - 1]; inner = `<div class="stack">${n > 1 ? '<i class="back" style="transform:translate(2px,2px)"></i>' : ''}</div><div class="face">${cardHTML(UI.view.cards[top])}</div>`; }
    return `${inner}<span class="n">${n}</span><span class="lbl">${kind === 'deck' ? '牌库' : '弃牌'}</span>`;
  }
  function renderPiles(v) {
    for (const [pos, seat] of [['me', UI.viewer], ['op', 1 - UI.viewer]]) {
      for (const kind of ['deck', 'discard']) {
        const p = $(`#${kind}-${pos}`); const s = v.seats[seat];
        const sig = kind + (kind === 'deck' ? s.deckCount : s.discard.length + ':' + s.discard[s.discard.length - 1]);
        if (p.dataset.sig !== sig) { p.innerHTML = pileHTML(seat, kind); p.dataset.sig = sig; }
      }
    }
    $('#deck-me').classList.toggle('can-draw', myTurn() && UI.disp[UI.viewer].energy > 0);
    $('#deck-me').title = myTurn() && UI.disp[UI.viewer].energy > 0 ? '点击：消耗 1 奶劲抽 1 张' : '查看牌库构成';
  }

  function renderResources() {
    const d = UI.disp[UI.viewer];
    for (const k of ['coin', 'energy', 'power']) {
      const o = $('#orb-' + k); const b = o.querySelector('b');
      if (b.textContent !== String(d[k])) b.textContent = d[k];
      o.classList.toggle('zero', !d[k]);
    }
    const mt = myTurn();
    $('#orb-energy').classList.toggle('armed', mt && d.energy > 0);
    $('#orb-energy').classList.toggle('clickable', mt && d.energy > 0);
    $('#orb-power').classList.toggle('armed', mt && d.power > 0);
    const od = UI.disp[1 - UI.viewer];
    const box = $('#oppRes');
    box.classList.toggle('on', UI.view.active !== UI.viewer && !UI.view.over);
    box.querySelector('.c').textContent = '◉ ' + od.coin; box.querySelector('.e').textContent = '✦ ' + od.energy; box.querySelector('.p').textContent = '✷ ' + od.power;
  }

  function renderPending(v) {
    const box = $('#pending'), pd = v.pending;
    if (UI.replaceFor) {
      box.className = 'pending on';
      box.innerHTML = `<span>雕塑最多 ${v.rules.statueLimit} 座：点击你的一座雕塑进行替换</span><button class="btn ghost" data-act="cancelReplace">取消</button>`;
      return;
    }
    if (!pd) { box.className = 'pending'; box.innerHTML = ''; return; }
    if (pd.seat !== UI.viewer || !UI.isHuman(UI.viewer)) {
      box.className = 'pending on mine-wait'; box.innerHTML = `<span>等待 ${esc(v.seats[pd.seat].name)} 做出选择…</span>`; return;
    }
    const zones = pd.zones || {}, opts = pd.options || [];
    const extra = [];
    if (opts.some(u => zones[u] === 'discard')) extra.push('<button class="btn ghost" data-act="pick" data-zone="discard">从弃牌堆选</button>');
    if (opts.some(u => zones[u] === 'deck')) extra.push('<button class="btn ghost" data-act="pick" data-zone="deck">从抽牌堆选</button>');
    if (pd.optional) extra.push('<button class="btn ghost" data-act="skip">跳过</button>');
    box.className = 'pending on';
    box.innerHTML = `<span>${esc(pd.prompt)}</span>${extra.join('')}`;
  }

  function leftovers() {
    const s = me(), d = UI.disp[UI.viewer], v = UI.view;
    const playable = (s.hand || []).filter(u => CARDS[v.cards[u]].type !== 'statue' || s.statues.length < v.rules.statueLimit).length;
    const bits = [];
    if (playable) bits.push(`${playable} 张手牌`);
    if (d.power > 0 && !me().status.includes('hold')) bits.push(`${d.power}✷`);
    if (d.coin >= 2) bits.push(`${d.coin}◉`);
    if ((s.trashOps || []).length) bits.push(`${s.trashOps.length} 次删牌机会`);
    return bits;
  }
  function renderButtons(v) {
    const mt = myTurn();
    const end = $('#btnEnd');
    end.disabled = !mt;
    const lo = mt ? leftovers() : [];
    const armed = UI.endArm > Date.now();
    end.classList.toggle('warn', armed);
    end.classList.toggle('glow', mt && !lo.length);
    end.innerHTML = armed ? `确认结束<span class="sub">还有 ${lo.join('、')} 未用</span>` : '结束回合<kbd>E</kbd>';
    const hand = me().hand || [];
    $('#btnAll').disabled = !mt || !hand.some(u => CARDS[v.cards[u]].type !== 'statue');
    $('#btnDraw').disabled = !mt || UI.disp[UI.viewer].energy < 1;
    UI.renderRail();
  }

  function renderTicker(v) {
    const ul = $('#tickerList');
    const items = v.log.slice(-7);
    const sig = items.map(x => x.text).join('|') + v.log.length;
    if (ul.dataset.sig === sig) return; ul.dataset.sig = sig;
    if (!items.length) { ul.innerHTML = '<li class="empty">双方的每个动作都会记录在这里。<br>小提示：手牌上出现「联动就绪」时打出，会额外触发阵营效果。</li>'; }
    else ul.innerHTML = items.map((x, i) => `<li class="${x.s === UI.viewer ? '' : 'op'} ${i < items.length - 4 ? 'old' : ''}"><i></i><span>${esc(x.text)}</span></li>`).join('');
  }

  /* ---------------- 关卡任务面板（每次渲染都刷新） ---------------- */
  UI.objectiveText = function (v) {
    const o = v.objective || { type: 'defeat' }, foe = v.seats[1 - (o.seat || 0)], me0 = v.seats[o.seat || 0];
    if (o.type === 'survive') return { text: `撑过 ${o.rounds} 回合`, prog: `${Math.min(v.round, o.rounds)} / ${o.rounds}`, ratio: Math.min(1, (v.round - 1) / o.rounds) };
    if (o.type === 'breakStatues') return { text: `累计击碎 ${o.n} 座敌方雕塑`, prog: `${me0.stats.broke} / ${o.n}`, ratio: me0.stats.broke / o.n };
    return { text: `击败 ${foe.name}`, prog: `剩余 ${UI.disp ? UI.disp[1 - (o.seat || 0)].hp : foe.hp} / ${foe.maxHp}`, ratio: 1 - foe.hp / foe.maxHp };
  };
  function ownedView(v) {
    const p = v.seats[0], ids = (p.deckList || []).slice();
    for (const u of [].concat(p.hand || [], p.discard, p.played, p.statues.map(x => x.uid), p.limbo && p.limbo.uid ? [p.limbo.uid] : [])) if (v.cards[u]) ids.push(v.cards[u]);
    return ids;
  }
  function starState(s, v) {
    const p = v.seats[0], st = p.stats;
    const over = v.over, won = v.winner === 0;
    const prog = (n, need) => ({ ok: n >= need, fail: over && !(won && n >= need), text: `${n} / ${need}` });
    switch (s.type) {
      case 'win': return { ok: over && won, fail: over && !won, text: over ? (won ? '达成' : '未达成') : '进行中' };
      case 'rounds': return { ok: over && won && v.round <= s.max, fail: v.round > s.max || (over && !won), text: `第 ${v.round} / ${s.max} 回合` };
      case 'hp': return { ok: over && won && p.hp >= s.min, fail: p.hp < s.min || (over && !won), text: `当前 ${p.hp}` };
      case 'broke': return prog(st.broke, s.n);
      case 'trashed': return prog(st.trashed, s.n);
      case 'dealt': return prog(st.dmg, s.n);
      case 'allies': return prog(st.allies, s.n);
      case 'bought': return prog(st.bought, s.n);
      case 'statuesPlayed': return prog(st.statuesPlayed, s.n);
      case 'extraDraws': return prog(st.extraDraws, s.n);
      case 'turnPlays': return prog(st.maxTurnPlays || 0, s.n);
      case 'heroHits': return prog(st.maxTurnHeroHits || 0, s.n);
      case 'bigHit': return prog(st.bigHit || 0, s.n);
      case 'drawn': return prog(st.drawn || 0, s.n);
      case 'statusPlayed': return prog(st.statusPlayed || 0, s.n);
      case 'trashedId': return prog((st.trashedIds || {})[s.id] || 0, s.n);
      case 'purge': { const left = ownedView(v).filter(id => s.ids.includes(id)).length; return { ok: over && won && !left, fail: over && !(won && !left), text: left ? `还剩 ${left} 张` : '已删光' }; }
      case 'boughtMax': return { ok: over && won && st.bought <= s.n, fail: st.bought > s.n || (over && !won), text: `已招募 ${st.bought} / 最多 ${s.n}` };
      default: return { ok: false, fail: false, text: '' };
    }
  }
  function renderMission(v) {
    const box = $('#mission'); if (!box) return;
    const lv = UI.mode === 'pve' && UI.opts.level;
    box.style.display = lv ? '' : 'none';
    $('#ticker').classList.toggle('with-mission', !!lv);
    if (!lv) return;
    const o = UI.objectiveText(v);
    const stars = lv.stars.slice(1).map(s => { const t = starState(s, v); return `<li class="${t.ok ? 'ok' : t.fail ? 'fail' : ''}"><b>${t.ok ? '★' : t.fail ? '✕' : '☆'}</b><span>${esc(s.label)}</span><em>${esc(t.text)}</em></li>`; }).join('');
    const muts = (v.mutators || []).map(m => NW.Campaign.mutatorText(m).name).join(' · ');
    const html = `<div class="m-head"><span>关卡任务</span><button data-top="mission">详情 ›</button></div>
      <div class="m-goal"><b>🎯 ${esc(o.text)}</b><em>${esc(o.prog)}</em></div><div class="m-bar"><i style="width:${Math.max(0, Math.min(100, o.ratio * 100))}%"></i></div>
      <ul class="m-stars">${stars}</ul>${muts ? `<div class="m-muts">规则：${esc(muts)}</div>` : ''}`;
    if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }
  }

  function renderLimbo(v) {
    const s = me(), box = $('#limbo'), slot = $('#limboSlot');
    if (s.limbo && s.limbo.uid) {
      box.classList.add('on');
      const e = el(s.limbo.uid);
      if (e.parentNode !== slot) { slot.innerHTML = ''; slot.appendChild(e); }
      $('#btnUndoTrash').style.display = myTurn() ? '' : 'none';
    } else { box.classList.remove('on'); Array.from(slot.children).forEach(c => c.remove()); }
    // 删牌机会
    const ops = s.trashOps || [], t = $('#trashOps');
    const on = ops.length > 0 && myTurn() && !(s.limbo && s.limbo.uid);
    t.classList.toggle('on', on);
    if (on) {
      $('#trashOpsN').textContent = `删牌机会 ×${ops.length}`;
      const zones = Array.from(new Set([].concat(...ops.map(o => o.from)))).map(z => ({ hand: '手牌', discard: '弃牌堆', deck: '抽牌堆' }[z]));
      const mk = Math.max(...ops.map(o => o.market || 0));
      t.querySelector('small').textContent = `本回合内有效，可删${zones.join('、')}${mk ? `，或移除市场中价格 ≤ ${mk} 的牌` : ''}`;
    }
  }

  /* ================= 过渡动画 ================= */
  function snapshot() {
    const m = new Map();
    $$('#screen-game [data-uid]').forEach(e => { if (e.isConnected) m.set(e.dataset.uid, { el: e, rect: FX.rect(e) }); });
    return m;
  }
  const anchors = () => ({
    deck: [FX.rect($('#deck-' + (UI.viewer === 0 ? 'me' : 'op'))), FX.rect($('#deck-' + (UI.viewer === 1 ? 'me' : 'op')))],
    discard: [FX.rect($('#discard-' + (UI.viewer === 0 ? 'me' : 'op'))), FX.rect($('#discard-' + (UI.viewer === 1 ? 'me' : 'op')))],
    hero: [FX.rect($('#hero-' + (UI.viewer === 0 ? 'me' : 'op')).querySelector('.portrait')), FX.rect($('#hero-' + (UI.viewer === 1 ? 'me' : 'op')).querySelector('.portrait'))],
    oppHand: FX.rect($('#oppHand')), supply: FX.rect($('#supply')), errand: FX.rect($('#errandSlot')),
    orb: { coin: FX.rect($('#orb-coin')), energy: FX.rect($('#orb-energy')), power: FX.rect($('#orb-power')) },
    oppRes: FX.rect($('#oppRes')),
  });

  UI.transition = async function (prev, v, events, action) {
    hidePreview();
    const first = snapshot();
    const A = anchors();
    // 拖拽释放的牌：在记录位置后清除拖拽样式，让它从松手处飞向目标
    if (UI.dragRelease) { const d = UI.dragRelease; UI.dragRelease = null; d.classList.remove('dragging'); d.style.translate = ''; d.style.rotate = ''; d.style.scale = ''; }
    UI.render(false);
    const anims = [];
    const byType = t => events.filter(e => e.t === t);
    const drawn = new Set([].concat(...byType('draw').map(e => e.uids)));
    const unlimbo = new Set(byType('unlimbo').map(e => e.uid));
    const oppPlays = byType('play').filter(e => !isMine(e.seat) || (UI.mode !== 'hotseat' && !UI.isHuman(e.seat)));
    const showPlays = byType('play').filter(e => CARDS[v.cards[e.uid]] && CARDS[v.cards[e.uid]].fullArt && e.to === 'play');
    let drawIdx = 0, spot = null;

    // 1) 仍在场的元素：FLIP / 新出现
    for (const e of $$('#screen-game [data-uid]')) {
      const uid = e.dataset.uid, f = first.get(uid), last = FX.rect(e);
      if (!last || !last.w) continue;
      if (e.closest('#playcards') && showPlays.some(p => p.uid === uid)) { spot = spot || []; spot.push({ e, last, id: v.cards[uid], from: f ? f.rect : null, show: true }); continue; }
      if (f) {
        const dx = f.rect.cx - last.cx, dy = f.rect.cy - last.cy, s = f.rect.w / last.w;
        if (Math.abs(dx) + Math.abs(dy) > 2 || Math.abs(s - 1) > .02) anims.push(flip(e, `translate(${dx}px,${dy}px) scale(${s})`, 420));
        continue;
      }
      const inHand = e.closest('#hand'), inMarket = e.closest('#market'), inPlay = e.closest('#playcards'), inStatue = e.closest('.statue-slot');
      const play = oppPlays.find(p => p.uid === uid);
      if (play && (inPlay || inStatue)) { spot = spot || []; spot.push({ e, last, id: v.cards[uid] }); continue; }
      let from = null, dur = 460, delay = 0, flipY = true;
      if (inHand && drawn.has(uid)) { from = A.deck[UI.viewer]; delay = 70 * drawIdx++; }
      else if (inHand && unlimbo.has(uid)) { from = FX.rect($('#limbo')); flipY = false; }
      else if (inMarket) { from = A.supply; dur = 520; delay = 180; }
      else if (inStatue) { from = { cx: last.cx, cy: last.cy - 80, w: last.w * .6, h: last.h * .6 }; flipY = false; FX.sparkle(last.cx, last.cy); }
      else if (inHand) { from = A.deck[UI.viewer]; }
      if (from) anims.push(flip(e, `translate(${from.cx - last.cx}px,${from.cy - last.cy}px) scale(${(from.w || last.w) / last.w})${flipY ? ' rotateY(180deg)' : ''}`, dur, delay));
    }

    // 2) 离场的元素：飞向牌堆 / 焚毁 / 碎裂
    const gone = [];
    for (const [uid, f] of first) if (!f.el.isConnected) gone.push([uid, f]);
    let cleanIdx = 0;
    for (const [uid, f] of gone) {
      const buy = events.find(e => e.t === 'buy' && e.uid === uid);
      const trash = events.find(e => (e.t === 'trash' || e.t === 'scrap') && e.uid === uid);
      const broke = events.find(e => e.t === 'statueBroken' && e.uid === uid);
      const churn = events.find(e => e.t === 'marketChurn' && e.old === uid);
      const cleanup = events.find(e => e.t === 'cleanup' && e.uids.includes(uid));
      const disc = events.find(e => (e.t === 'discard' || e.t === 'statueReplaced') && e.uid === uid);
      if (buy) anims.push(FX.flyGhost(f.el, f.rect, buy.to === 'deck' ? A.deck[buy.seat] : A.discard[buy.seat], { lift: 60, dur: 620 }));
      else if (trash) anims.push(FX.burn(f.el, f.rect));
      else if (broke) { /* 由事件特效处理碎裂 */ UI._broken = UI._broken || {}; UI._broken[uid] = f; }
      else if (churn) anims.push(FX.flyGhost(f.el, f.rect, { cx: f.rect.cx, cy: f.rect.cy - 120, w: f.rect.w, h: f.rect.h }, { dur: 700 }));
      else if (cleanup) anims.push(FX.flyGhost(f.el, f.rect, A.discard[cleanup.seat], { dur: 520, delay: 50 * cleanIdx++ }));
      else if (disc) anims.push(FX.flyGhost(f.el, f.rect, A.discard[disc.seat], { dur: 480 }));
      else anims.push(FX.flyGhost(f.el, f.rect, { cx: f.rect.cx, cy: f.rect.cy, w: f.rect.w * .8, h: f.rect.h * .8 }, { dur: 300 }));
    }
    // 常驻牌购买：从常驻格飞出一张
    for (const b of byType('buy')) if (typeof b.slot === 'string') anims.push(FX.flyGhost($('#errandSlot .card'), A.errand, b.to === 'deck' ? A.deck[b.seat] : A.discard[b.seat], { lift: 60, dur: 620 }));
    // 对手抽牌：卡背从牌库飞到手牌
    for (const d of byType('draw')) if (!isMine(d.seat)) d.uids.forEach((_, i) => anims.push(flyBack(A.deck[d.seat], A.oppHand, 60 * i)));
    for (const d of byType('draw')) if (isMine(d.seat) && UI.viewer === d.seat) FX.sfx('card');

    // 3) 对手打牌：聚光展示
    if (spot) for (const sp of spot) await (sp.show ? showcase(sp, A) : spotlight(sp, A));

    // 4) 事件特效
    await UI.playEvents(events, A, action);
    await Promise.all(anims);
    UI.syncDisp();
    UI.render(false);
  };

  function flip(e, from, dur, delay = 0) {
    if (FX.reduced()) return Promise.resolve();
    const a = e.animate([{ transform: from }, { transform: 'none' }], { duration: FX.ms(dur), delay: FX.ms(delay), easing: 'cubic-bezier(.25,.8,.25,1)', fill: 'backwards' });
    return a.finished.catch(() => {});
  }
  function flyBack(from, to, delay) {
    if (!from || !to || FX.reduced()) return Promise.resolve();
    const g = document.createElement('div'); g.className = 'back fx-ghost';
    Object.assign(g.style, { position: 'absolute', left: (from.cx - 29) + 'px', top: (from.cy - 41) + 'px', width: '58px', height: '82px', borderRadius: '7px' });
    $('#fx').appendChild(g);
    return g.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${to.cx - from.cx}px,${to.cy - from.cy}px) rotate(-8deg)`, opacity: .2 }], { duration: FX.ms(420), delay: FX.ms(delay), easing: 'ease-in-out', fill: 'both' }).finished.catch(() => {}).then(() => g.remove());
  }
  async function spotlight(sp, A) {
    const { e, last, id } = sp;
    if (FX.reduced()) return;
    e.style.opacity = '0';
    const g = makeCard(id); g.classList.add('fx-ghost');
    const W = 250, H = 350, cx = 800, cy = 440;
    Object.assign(g.style, { position: 'absolute', left: (cx - W / 2) + 'px', top: (cy - H / 2) + 'px', zIndex: 10 });
    g.style.setProperty('--cw', W + 'px');
    $('#fx').appendChild(g);
    const dim = $('#spotDim'); dim.classList.add('on');
    FX.sfx('card');
    const from = A.oppHand;
    await g.animate([
      { transform: `translate(${from.cx - cx}px,${from.cy - cy}px) scale(.24) rotateY(180deg)`, opacity: .6 },
      { transform: 'none', opacity: 1 }], { duration: FX.ms(420), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }).finished.catch(() => {});
    await FX.wait(CARDS[id].cost === 0 ? 160 : UI.mode === 'online' ? 650 : 520); // 起始牌一闪而过，市场牌停留展示
    dim.classList.remove('on');
    await g.animate([{ transform: 'none' }, { transform: `translate(${last.cx - cx}px,${last.cy - cy}px) scale(${last.w / W})` }], { duration: FX.ms(320), easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' }).finished.catch(() => {});
    g.remove(); e.style.opacity = '';
    e.classList.remove('just-played'); void e.offsetWidth; e.classList.add('just-played');
  }

  /* 全画幅卡（自带场景背景）出场：放大旋转登场 + 阵营光芒 + 闪卡扫光 */
  async function showcase(sp, A) {
    const { e, last, id } = sp, c = CARDS[id], col = FACTIONS[c.faction].color;
    if (FX.reduced()) return;
    e.style.opacity = '0';
    const W = 330, H = W * 1.4, cx = 800, cy = 430;
    const dim = $('#spotDim'); dim.classList.add('on');
    const rays = document.createElement('div'); rays.className = 'show-rays fx-ghost';
    rays.style.cssText = `left:${cx - 520}px;top:${cy - 520}px;--fc:${col}`;
    $('#fx').appendChild(rays);
    const ra = rays.animate([{ transform: 'scale(.2) rotate(0deg)', opacity: 0 }, { transform: 'scale(1) rotate(40deg)', opacity: 1, offset: .25 }, { transform: 'scale(1.05) rotate(120deg)', opacity: 1, offset: .8 }, { transform: 'scale(1.2) rotate(150deg)', opacity: 0 }], { duration: FX.ms(1700), easing: 'linear', fill: 'both' });
    const g = makeCard(id); g.classList.add('fx-ghost', 'showing');
    Object.assign(g.style, { left: (cx - W / 2) + 'px', top: (cy - H / 2) + 'px', zIndex: 11 }); g.style.setProperty('--cw', W + 'px');
    $('#fx').appendChild(g);
    const from = sp.from || A.oppHand;
    FX.sfx('card');
    await g.animate([
      { transform: `translate(${from.cx - cx}px,${from.cy - cy}px) scale(${(from.w || 60) / W}) rotate(-14deg)`, opacity: .7 },
      { transform: 'translate(0,-30px) scale(1.24) rotate(5deg)', opacity: 1, offset: .7 },
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 }], { duration: FX.ms(560), easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' }).finished.catch(() => {});
    FX.sfx('ally'); FX.screenShake(7);
    FX.burst(cx, cy, { n: 40, color: [col, '#fff3c4', '#ffffff'], speed: 520, size: 9, shape: 'star', gravity: 120, life: 1100 });
    FX.burst(cx, cy, { n: 18, color: [col], speed: 260, size: 16, gravity: -40, life: 900 });
    g.classList.add('sweep');
    FX.float(cx, cy - H / 2 - 64, `${c.name}！`, 'ally', { bg: col, dy: -24, dur: 1500 });
    await FX.wait(UI.mode === 'online' ? 900 : 760);
    dim.classList.remove('on');
    await g.animate([{ transform: 'none' }, { transform: `translate(${last.cx - cx}px,${last.cy - cy}px) scale(${last.w / W})` }], { duration: FX.ms(340), easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' }).finished.catch(() => {});
    await ra.finished.catch(() => {}); rays.remove();
    g.remove(); e.style.opacity = '';
    e.classList.remove('just-played'); void e.offsetWidth; e.classList.add('just-played');
  }

  /* ---------------- 事件 → 特效 ---------------- */
  const RES_CLS = { coin: 'c', energy: 'e', power: 'p' };
  const RES_COLOR = { coin: '#ffd04a', energy: '#59d2c0', power: '#ff7a52' };
  const RES_ICON = { coin: '◉', energy: '✦', power: '✷' };
  function srcRect(src, seat) {
    if (src && typeof src === 'string') { const e = UI.els.get(src); if (e && e.isConnected) return FX.rect(e); }
    return FX.rect($('#hero-' + (isMine(seat) ? 'me' : 'op')).querySelector('.portrait'));
  }
  function resTarget(seat, res) { return isMine(seat) ? FX.rect($('#orb-' + res)) : FX.rect($('#oppRes')); }
  function bumpRes(seat, res, n) {
    UI.disp[seat][res] = Math.max(0, UI.disp[seat][res] + n);
    renderResources();
    if (isMine(seat)) FX.shake($('#orb-' + res), 'pop');
  }

  UI.playEvents = async function (events, A, action) {
    const hasPlay = events.some(e => e.t === 'play' && isMine(e.seat));
    if (hasPlay) { FX.sfx('card'); await FX.wait(200); }
    let pendingOrbs = [];
    for (const ev of events) {
      switch (ev.t) {
        case 'gain': {
          const from = srcRect(ev.src, ev.seat), to = resTarget(ev.seat, ev.res);
          if (from) FX.float(from.cx, from.y + 16, `+${ev.n}${RES_ICON[ev.res]}`, RES_CLS[ev.res]);
          FX.sfx(ev.res === 'coin' ? 'coin' : ev.res);
          const p = FX.orb({ x: from.cx, y: from.cy }, { x: to.cx, y: to.cy }, RES_COLOR[ev.res], { dur: 480 }).then(() => bumpRes(ev.seat, ev.res, ev.n));
          pendingOrbs.push(p); await FX.wait(130); break;
        }
        case 'spend': bumpRes(ev.seat, ev.res, -ev.n); break;
        case 'buy': UI.disp[ev.seat].coin -= ev.cost; renderResources(); FX.sfx('buy'); break;
        case 'shield': {
          const r = A.hero[ev.seat], from = srcRect(ev.src, ev.seat);
          FX.sfx('heal');
          await FX.orb({ x: from.cx, y: from.cy }, { x: r.cx, y: r.cy }, '#9fd0ff', { dur: 420 });
          FX.float(r.cx, r.y, `+${ev.n} 奶壳`, 's'); FX.sparkle(r.cx, r.cy, '#cfe9ff');
          UI.disp[ev.seat].shield += ev.n; renderHero(isMine(ev.seat) ? 'me' : 'op', ev.seat); break;
        }
        case 'shieldFade': UI.disp[ev.seat].shield = 0; renderHero(isMine(ev.seat) ? 'me' : 'op', ev.seat); break;
        case 'heal': {
          if (!ev.n) break;
          const r = A.hero[ev.seat]; FX.float(r.cx, r.y, `+${ev.n}♥`, 'h'); FX.sparkle(r.cx, r.cy, '#8dffa8'); FX.sfx('heal');
          UI.disp[ev.seat].hp += ev.n; renderHero(isMine(ev.seat) ? 'me' : 'op', ev.seat); await FX.wait(160); break;
        }
        case 'attack': {
          await Promise.all(pendingOrbs); pendingOrbs = [];
          UI.disp[ev.seat].power = Math.max(0, UI.disp[ev.seat].power - ev.n); renderResources();
          const from = isMine(ev.seat) ? A.orb.power : A.hero[ev.seat];
          let to;
          if (ev.target === 'hero') to = A.hero[1 - ev.seat];
          else { const f = (UI._broken || {})[ev.target]; to = f ? f.rect : srcRect(ev.target, 1 - ev.seat); }
          FX.sfx('power');
          await FX.orb({ x: from.cx, y: from.cy }, { x: to.cx, y: to.cy }, '#ff7a52', { size: 26 + Math.min(30, ev.n * 2), dur: 520, lift: 120, arc: 0 });
          break;
        }
        case 'damage': {
          const pos = isMine(ev.seat) ? 'me' : 'op', r = A.hero[ev.seat];
          FX.shake($('#hero-' + pos)); FX.screenShake(Math.min(14, 4 + ev.n)); FX.sfx('hit');
          FX.burst(r.cx, r.cy, { n: 24, color: ['#ff5a5a', '#ffb36a', '#fff'], speed: 300, size: 8 });
          if (ev.absorbed) { FX.float(r.cx, r.y - 4, `奶壳挡下 ${ev.absorbed}`, 's'); FX.burst(r.cx, r.cy, { n: 18, color: ['#cfe9ff', '#ffffff', '#9fd0ff'], speed: 220, size: 7, shape: 'shard', gravity: 300 }); }
          if (ev.n) FX.float(r.cx, r.cy + 10, `-${ev.n}`, 'd');
          UI.disp[ev.seat].hp = ev.hp; UI.disp[ev.seat].shield = ev.shield || 0; renderHero(pos, ev.seat);
          await FX.wait(380); break;
        }
        case 'statueBroken': {
          const f = (UI._broken || {})[ev.uid];
          if (f) { FX.shatter(f.rect.cx, f.rect.cy); FX.sfx('shatter'); FX.flyGhost(f.el, f.rect, A.discard[ev.seat], { dur: 700, delay: 120 }); delete UI._broken[ev.uid]; }
          FX.screenShake(6); await FX.wait(300); break;
        }
        case 'ally': {
          const a = UI.els.get(ev.uid), b = UI.els.get(ev.partner);
          const ra = a && a.isConnected ? FX.rect(a) : null, rb = b && b.isConnected ? FX.rect(b) : null;
          const color = FACTIONS[ev.faction].color;
          if (ra && rb) FX.link(ra, rb, color);
          if (ra) { FX.float(ra.cx, ra.y - 6, `${FACTIONS[ev.faction].name} 联动！`, 'ally', { bg: color, dy: -30, dur: 1200 }); FX.burst(ra.cx, ra.cy, { n: 16, color, speed: 160, size: 7, shape: 'star', gravity: -40 }); }
          FX.sfx('ally');

          await FX.wait(360); break;
        }
        case 'statueTrigger': { const e = UI.els.get(ev.uid); if (e && e.isConnected) FX.shake(e, 'trigger'); break; }
        case 'passive': { const e = UI.els.get(ev.uid); if (e && e.isConnected) { const r = FX.rect(e); FX.sparkle(r.cx, r.cy, { frenzy: '#ff9a72', army: '#ff7a52', gate: '#ffd86a' }[ev.kind] || '#7ff2e0'); if (ev.kind === 'army') FX.float(r.cx, r.y - 4, '哈！', 'txt'); } break; }
        case 'guard': {
          const r = A.hero[ev.seat], from = srcRect(ev.uid, ev.seat);
          FX.sfx('ally');
          if (from) await FX.orb({ x: from.cx, y: from.cy }, { x: r.cx, y: r.cy }, CARDS[ev.id].guard.cap ? '#c9b4ff' : '#9fe07a', { dur: 420 });
          FX.float(r.cx, r.y - 8, `守势·${CARDS[ev.id].name}`, 'ally', { bg: FACTIONS[CARDS[ev.id].faction].color, dy: -26, dur: 1300 });
          FX.burst(r.cx, r.cy, { n: 18, color: ['#fff', FACTIONS[CARDS[ev.id].faction].color], speed: 180, size: 7, shape: 'star', gravity: -30 });
          if (!isMine(ev.seat)) FX.toast(`对手进入守势：${CARDS[ev.id].name}——${guardDesc(ev.id)}`);
          await FX.wait(200); break;
        }
        case 'guardCap': { const r = A.hero[ev.seat]; FX.float(r.cx, r.y - 30, `惊鸿一瞥 挡下 ${ev.cut}`, 's'); FX.burst(r.cx, r.cy, { n: 14, color: ['#c9b4ff', '#fff'], speed: 200, size: 7, shape: 'shard', gravity: 200 }); break; }
        case 'thorns': {
          const from = A.hero[ev.from], to = A.hero[ev.seat];
          await FX.orb({ x: from.cx, y: from.cy }, { x: to.cx, y: to.cy }, '#9fe07a', { size: 22, dur: 420, lift: 80 });
          FX.float(from.cx, from.y - 10, `榴莲刺 反伤 ${ev.n}`, 'txt'); break;
        }
        case 'pierce': { const r = A.hero[ev.seat]; FX.float(r.cx, r.y - 10, '破壳！', 'txt'); if (isMine(ev.seat)) FX.toast('本回合你的攻击无视奶壳'); break; }
        case 'guardFade': renderHero(isMine(ev.seat) ? 'me' : 'op', ev.seat); break;
        case 'shuffle': {
          FX.sfx('shuffle');
          const from = A.discard[ev.seat], to = A.deck[ev.seat];
          for (let i = 0; i < Math.min(5, ev.n); i++) flyBack(from, to, i * 50);
          await FX.wait(260); break;
        }
        case 'curse': { const r = A.hero[ev.seat]; FX.float(r.cx, r.y - 10, `下回合弃 ${ev.n} 张`, 'txt'); break; }
        case 'topdeck': if (isMine(ev.seat)) FX.toast('本回合下一张购入的牌将置于牌库顶'); break;
        case 'scrap': FX.sfx('scrap'); await FX.wait(250); break;
        case 'trashOp': if (isMine(ev.seat)) { const r = FX.rect($('#trashOps')) ; const from = srcRect(ev.src, ev.seat); FX.float(from.cx, from.y, '+1 删牌机会', 'txt'); FX.sfx('ally'); } break;
        case 'trash': if (ev.from !== 'limbo') FX.sfx('scrap'); break;
        case 'statueSummon': FX.sfx('ally'); break;
        case 'turnStart': {
          await Promise.all(pendingOrbs); pendingOrbs = [];
          UI.disp[ev.seat].coin = 0; UI.disp[ev.seat].energy = 0; UI.disp[ev.seat].power = ev.carried || 0; renderResources();
          await FX.wait(300);
          FX.sfx('turn');
          if (UI.mode !== 'hotseat') await FX.banner(isMine(ev.seat) ? '你的回合' : `${UI.view.seats[ev.seat].name} 的回合`, `第 ${ev.round} 回合`, isMine(ev.seat) ? '' : 'op');
          break;
        }
        case 'banner': await FX.banner(ev.text, ev.sub, 'op'); break;
        case 'gameOver': FX.sfx(isMine(ev.winner) || UI.mode === 'hotseat' ? 'win' : 'lose'); break;
      }
    }
    await Promise.all(pendingOrbs);
  };

  /* ================= 交互 ================= */
  UI.tryPlay = function (uid, dragEl) {
    const v = UI.view, s = me(), c = CARDS[v.cards[uid]];
    if (c.type === 'statue' && s.statues.length >= v.rules.statueLimit) {
      UI.replaceFor = uid; UI.render(false); FX.toast('选择一座你的雕塑替换'); return 'replace';
    }
    if (dragEl) UI.dragRelease = dragEl;
    const err = UI.submit({ type: 'play', uid });
    if (err && dragEl) { UI.dragRelease = null; snapBack(dragEl); }
    return err;
  };
  function snapBack(e) {
    e.classList.remove('dragging');
    const t = e.style.translate || '0px 0px';
    e.style.translate = ''; e.style.rotate = ''; e.style.scale = '';
    const [x, y] = t.split(' ');
    e.animate([{ transform: `translate(${x},${y || '0px'})` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  }

  UI.playAll = async function () {
    if (!myTurn()) return;
    for (let guard = 0; guard < 20; guard++) {
      if (!myTurn()) break;
      const v = UI.view, hand = me().hand || [];
      const order = hand.filter(u => CARDS[v.cards[u]].type === 'status').concat(hand.filter(u => CARDS[v.cards[u]].type === 'char'));
      if (!order.length) break;
      const wait = UI.nextUpdate();
      if (UI.submit({ type: 'play', uid: order[0] }, true)) break;
      await wait;
    }
  };

  UI.endTurn = function () {
    if (!myTurn()) return;
    const lo = leftovers();
    if (lo.length && UI.endArm < Date.now()) { UI.endArm = Date.now() + 3000; renderButtons(UI.view); setTimeout(() => UI.view && renderButtons(UI.view), 3100); return; }
    UI.endArm = 0; UI.replaceFor = null; UI.submit({ type: 'endTurn' });
  };

  UI.attack = function (target) {
    if (!myTurn()) return;
    const err = UI.submit({ type: 'attack', target }, true);
    if (err) {
      FX.toast(err, 'bad'); FX.sfx('bad');
      if (target === 'hero') $$('#statues-op .card.taunt').forEach(e => FX.shake(e)); else FX.shake(UI.els.get(target));
    }
  };

  UI.maybeOpenPicker = function () {
    const pd = UI.view.pending; if (!pd || !pd.options) return;
    const zones = pd.options.map(u => pd.zones[u]);
    // 只有非手牌选项时（或选项全在抽牌堆/弃牌堆），自动打开选择器
    if (pd.kind !== 'destroyStatue' && !zones.includes('hand') && pd.options.length) NW.Screens.picker(UI, zones.includes('deck') ? 'deck' : 'discard');
  };

  function bind() {
    const stage = $('#stage');
    // 点击
    stage.addEventListener('click', e => {
      if (!UI.session || !$('#screen-game').classList.contains('on')) return;
      hidePreview();
      const t = e.target;
      const act = t.closest('[data-act]');
      if (act) return onAct(act.dataset.act, act);
      if (UI.suppressClick) { UI.suppressClick = false; return; }
      const scrap = t.closest('[data-scrap]');
      if (scrap && !useSheet()) { const card = scrap.closest('.card'); return onScrap(card.dataset.uid); }
      const card = t.closest('.card');
      if (card && card.closest('#hand')) return onHandClick(card);
      if (card && card.closest('#market')) return onBuy(+card.dataset.slot, card);
      if (card && card.closest('#errandSlot')) return onBuy('p:errand', card);
      if (card && card.closest('#statues-op')) return onEnemyStatue(card.dataset.uid);
      if (card && card.closest('#statues-me')) return onMyStatue(card.dataset.uid);
      if (card && card.closest('#playcards') && useSheet()) {
        const uid = card.dataset.uid, c = CARDS[card.dataset.id], acts = [];
        if (c.scrap && isMine(UI.view.active) && myTurn()) acts.push({ label: '献祭这张牌', primary: true, run: () => UI.submit({ type: 'scrap', uid }) });
        return UI.sheet(card.dataset.id, acts, tipFor(card));
      }
      if (t.closest('#hero-op')) return onEnemyHero();
      if (t.closest('#deck-me')) { if (myTurn() && UI.disp[UI.viewer].energy > 0) return UI.submit({ type: 'drawExtra' }); return NW.Screens.pileViewer(UI, 'deck'); }
      if (t.closest('#discard-me')) return NW.Screens.pileViewer(UI, 'discard');
      if (t.closest('#discard-op')) return NW.Screens.pileViewer(UI, 'oppDiscard');
      if (t.closest('#deck-op')) return FX.toast(`对手牌库剩余 ${op().deckCount} 张`);
      if (t.closest('#orb-energy') && myTurn() && UI.disp[UI.viewer].energy > 0) return UI.submit({ type: 'drawExtra' });
      if (t.closest('#orb-power') && myTurn() && UI.disp[UI.viewer].power > 0) return FX.toast('按住奶之力拖到目标上，或直接点击对手头像 / 雕塑');
    });
    // 右键查看
    stage.addEventListener('contextmenu', e => {
      const card = e.target.closest('.card'); if (!card) return;
      e.preventDefault();
      if (UI.lastPointer && UI.lastPointer !== 'mouse') return; // 触屏长按由计时器处理
      NW.Screens.inspect(card.dataset.id);
    });
    // 拖拽与瞄准
    stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    // 悬停预览
    stage.addEventListener('pointerover', e => {
      if (UI.drag || UI.aim || e.pointerType === 'touch') return;
      const card = e.target.closest('.card');
      if (card && !card.closest('#hand') && !card.closest('.preview') && !card.closest('.overlay') && !card.classList.contains('fx-ghost')) showPreview(card);
    });
    stage.addEventListener('pointerout', e => { const card = e.target.closest('.card'); if (card && !card.contains(e.relatedTarget)) hidePreview(); });
    // 卡面高光跟随指针
    stage.addEventListener('pointermove', e => {
      const card = e.target.closest('.card'); if (!card) return;
      const r = card.getBoundingClientRect(); card.style.setProperty('--shine', (100 - ((e.clientX - r.left) / r.width) * 100) * 1.6 + '%');
    });
    // 键盘
    window.addEventListener('keydown', e => {
      if (!UI.session || !$('#screen-game').classList.contains('on')) return;
      if (e.target.closest && e.target.closest('input,select,textarea')) return;
      if (!$('#overlay').classList.contains('hidden')) { if (e.key === 'Escape') NW.Screens.close(); return; }
      if (e.key === ' ') { e.preventDefault(); UI.playAll(); }
      else if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') UI.endTurn();
      else if (e.key === 'd' || e.key === 'D') { if (myTurn()) UI.submit({ type: 'drawExtra' }); }
      else if (e.key === 'Escape') { UI.replaceFor = null; UI.scrapArm = null; UI.render(false); }
    });
  }

  function onAct(act, node) {
    switch (act) {
      case 'end': return UI.endTurn();
      case 'all': return UI.playAll();
      case 'draw': return UI.submit({ type: 'drawExtra' });
      case 'skip': return UI.submit({ type: 'choose', value: 'skip' });
      case 'pick': return NW.Screens.picker(UI, node.dataset.zone);
      case 'cancelReplace': UI.replaceFor = null; return UI.render(false);
      case 'undoTrash': return UI.submit({ type: 'undoTrash' });
      case 'trashPick': return NW.Screens.trashPicker(UI);
      case 'emote': if (UI.opts.link) { UI.opts.link.emote(node.dataset.id); NW.Screens.emote(node.dataset.id, true); } return;
    }
  }
  function onHandClick(card) {
    const uid = card.dataset.uid, pd = UI.view.pending;
    if (confirmTap()) {
      const sel = myChoice() && (pd.options || []).includes(uid);
      const why = sel ? '' : UI.view.pending ? (myChoice() ? '请先完成当前选择' : '等待对手选择…') : !myTurn() ? '还没轮到你' : '';
      return UI.sheet(card.dataset.id, [sel ? { label: '选择这张', primary: true, run: () => UI.submit({ type: 'choose', value: uid }) } : { label: why || '打出', primary: !why, disabled: !!why, run: () => UI.tryPlay(uid) }], tipFor(card));
    }
    if (myChoice() && (pd.options || []).includes(uid)) return UI.submit({ type: 'choose', value: uid });
    if (UI.view.pending) return FX.toast(myChoice() ? '请先完成当前选择' : '等待对手选择…');
    if (!myTurn()) return FX.toast('还没轮到你');
    UI.tryPlay(uid);
  }
  function onBuy(slot, card) {
    if (confirmTap()) {
      const id = card.dataset.id, cost = UI.view.costs[id];
      const err = !myTurn() ? (UI.view.pending ? '请先完成当前选择' : '还没轮到你') : UI.session.check({ seat: UI.viewer, type: 'buy', slot });
      return UI.sheet(id, [{ label: err || `购买（${cost} 奶蛋）`, primary: !err, disabled: !!err, run: () => UI.submit({ type: 'buy', slot }) }], tipFor(card));
    }
    if (!myTurn()) return FX.toast(UI.view.pending ? '请先完成当前选择' : '还没轮到你');
    const err = UI.submit({ type: 'buy', slot }, true);
    if (err) { FX.shake(card, 'shake'); FX.toast(err, 'bad'); FX.sfx('bad'); }
  }
  function onEnemyStatue(uid) {
    const pd = UI.view.pending;
    const sheetIt = confirmTap() || (useSheet() && !(myChoice() && pd.kind === 'destroyStatue') && !(myTurn() && UI.disp[UI.viewer].power > 0));
    if (sheetIt) {
      const e = UI.els.get(uid), hp = +(e && e.dataset.hp || 0), acts = [];
      if (myChoice() && pd.kind === 'destroyStatue') acts.push({ label: '击碎它', primary: true, run: () => UI.submit({ type: 'choose', value: uid }) });
      else if (myTurn() && UI.disp[UI.viewer].power > 0) { const err = UI.session.check({ seat: UI.viewer, type: 'attack', target: uid }); acts.push({ label: err || `攻击（消耗 ${hp} 奶之力）`, primary: !err, disabled: !!err, run: () => UI.attack(uid) }); }
      return UI.sheet(UI.view.cards[uid], acts, e ? tipFor(e) : '');
    }
    if (myChoice() && pd.kind === 'destroyStatue') return UI.submit({ type: 'choose', value: uid });
    if (myTurn() && UI.disp[UI.viewer].power > 0) return UI.attack(uid);
    NW.Screens.inspect(UI.view.cards[uid]);
  }
  function onMyStatue(uid) {
    if (UI.replaceFor) { const p = UI.replaceFor; UI.replaceFor = null; UI.submit({ type: 'play', uid: p, replace: uid }); return; }
    if (useSheet()) { const e = UI.els.get(uid); return UI.sheet(UI.view.cards[uid], [], e ? tipFor(e) : ''); }
    NW.Screens.inspect(UI.view.cards[uid]);
  }
  function onEnemyHero() {
    if (myTurn() && UI.disp[UI.viewer].power > 0) return UI.attack('hero');
  }
  function onScrap(uid) {
    if (!myTurn()) return;
    if (UI.scrapArm !== uid) { UI.scrapArm = uid; UI.render(false); setTimeout(() => { if (UI.scrapArm === uid) { UI.scrapArm = null; UI.view && UI.render(false); } }, 2600); return; }
    UI.scrapArm = null; UI.submit({ type: 'scrap', uid });
  }

  /* 拖拽打出 / 拖拽攻击 */
  function onDown(e) {
    UI.lastPointer = e.pointerType;
    if (!UI.session || e.button === 2) return;
    // 触屏长按任意卡牌：查看详情（iOS 不触发 contextmenu，自己计时）
    clearTimeout(UI.lpTimer);
    const lpCard = e.pointerType !== 'mouse' && e.target.closest('#screen-game .card');
    if (lpCard && lpCard.dataset.id) {
      const x0 = e.clientX, y0 = e.clientY;
      UI.lp = { x0, y0 };
      UI.lpTimer = setTimeout(() => {
        UI.lp = null;
        if (UI.drag && UI.drag.active) return;
        if (UI.drag) UI.drag = null;
        UI.suppressClick = true; setTimeout(() => { UI.suppressClick = false; }, 400);
        hidePreview(); UI.sheet(lpCard.dataset.id, [], tipFor(lpCard));
      }, 480);
    }
    const card = e.target.closest('#hand .card');
    if (card && myTurn() && !(UI.view.pending)) { UI.drag = { el: card, uid: card.dataset.uid, x0: e.clientX, y0: e.clientY, active: false, lx: e.clientX, vx: 0 }; return; }
    if (myTurn() && UI.disp[UI.viewer].power > 0 && (e.target.closest('#orb-power') || e.target.closest('#hero-me .portrait'))) {
      const r = FX.rect($('#orb-power')); UI.aim = { from: { x: r.cx, y: r.cy - 20 }, target: null };
      e.preventDefault(); hidePreview();
    }
  }
  function onMove(e) {
    if (UI.lp && Math.hypot(e.clientX - UI.lp.x0, e.clientY - UI.lp.y0) > 10) { clearTimeout(UI.lpTimer); UI.lp = null; }
    if (UI.drag) {
      const d = UI.drag, dx = (e.clientX - d.x0) / FX.scale, dy = (e.clientY - d.y0) / FX.scale;
      if (!d.active && Math.hypot(dx, dy) > 8) { d.active = true; d.el.classList.add('dragging'); hidePreview(); }
      if (d.active) {
        d.vx = d.vx * .7 + (e.clientX - d.lx) * .3; d.lx = e.clientX;
        d.el.style.translate = `${dx}px ${dy - 40}px`; d.el.style.rotate = `${Math.max(-18, Math.min(18, d.vx * 1.2))}deg`; d.el.style.scale = '1.08';
        const p = FX.toStage(e.clientX, e.clientY);
        $('#playZone').classList.toggle('drop', p.y < 600);
      }
    }
    if (UI.aim) {
      const p = FX.toStage(e.clientX, e.clientY);
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      let target = null, ok = false;
      const st = hit && hit.closest('#statues-op .card');
      if (st) { target = st.dataset.uid; ok = UI.disp[UI.viewer].power >= +st.dataset.hp; }
      else if (hit && hit.closest('#hero-op')) { target = 'hero'; ok = can({ type: 'attack', target: 'hero' }); }
      UI.aim.target = target;
      FX.arrow.show(UI.aim.from, p, ok);
    }
  }
  function onUp(e) {
    clearTimeout(UI.lpTimer); UI.lp = null;
    if (UI.drag) {
      const d = UI.drag; UI.drag = null; $('#playZone').classList.remove('drop');
      if (d.active) {
        UI.suppressClick = true; setTimeout(() => { UI.suppressClick = false; }, 50);
        const p = FX.toStage(e.clientX, e.clientY);
        if (p.y < 600 && myTurn()) { if (UI.tryPlay(d.uid, d.el) === 'replace') snapBack(d.el); }
        else snapBack(d.el);
      }
    }
    if (UI.aim) {
      const t = UI.aim.target; UI.aim = null; FX.arrow.hide();
      if (t) UI.attack(t);
    }
  }

  /* 预览 */
  function showPreview(card) {
    const id = card.dataset.id; if (!id) return;
    const pv = $('#preview'); const r = FX.rect(card);
    pv.innerHTML = cardHTML(id);
    const tip = previewTip(card, id); if (tip) pv.insertAdjacentHTML('beforeend', `<div class="tip">${tip}</div>`);
    const W = 250, H = 350;
    let x = r.x + r.w + 16; if (x + W > 1590) x = r.x - W - 16;
    let y = Math.max(10, Math.min(900 - H - 90, r.cy - H / 2));
    pv.style.left = x + 'px'; pv.style.top = y + 'px'; pv.style.width = W + 'px';
    pv.classList.remove('hidden');
  }
  function previewTip(card, id) {
    const c = CARDS[id], bits = [];
    if (c.ally) bits.push(`<b>联动</b>：本回合你打出了另一张${FACTIONS[c.faction].name}的牌，或场上有${FACTIONS[c.faction].name}雕塑时自动触发。`);
    if (c.scrap) bits.push('<b>献祭</b>：打出后可点击「献祭」将其移出游戏，换取一次性效果。');
    if (c.type === 'statue') bits.push(`<b>雕塑</b>：留在场上，从你的下个回合开始生效。耐久 ${card.dataset.hp || c.hp}，需一次性付出等量奶之力才能击碎。${c.taunt ? '<b>嘲讽</b>：在场时对手不能攻击你的本体。' : ''}`);
    if (c.type === 'status') { const k = NW.STATUS_KINDS[c.kind || 'buff']; bits.push(`<b>状态·${k.name}</b>：${k.desc}${c.passive === 'hold' ? '' : ''}`); }
    if (c.guard) bits.push(`<b>守势效果</b>：${guardDesc(id)}，持续到你下个回合开始。`);
    if (JSON.stringify(c.ally || []).includes('pierce')) bits.push('<b>破壳</b>：攻击对手本体时，伤害不会被奶壳吸收。');
    const et = UI.view && UI.view.rules.eliteTrashCost; if (et && !c.permanent && c.cost >= et && card.closest('#market')) bits.push(`<b>精英招募</b>：招募这张牌时，可删除手牌或弃牌堆中的 1 张牌。`);
    if (card.closest('#market') || card.closest('#errandSlot')) { const f = c.faction; if (f !== 'neutral') bits.push(`你的牌组里已有 ${countFaction(UI.viewer, f)} 张${FACTIONS[f].name}牌。`); }
    return bits.join('<br>');
  }
  function hidePreview() { $('#preview').classList.add('hidden'); }
  UI.hidePreview = hidePreview;

  /* 舞台缩放；触屏 / 小屏时进入触控模式：大按钮放到舞台旁的侧栏（真实像素大小），点牌弹出大卡面 */
  UI.fitStage = function () {
    const W = window.innerWidth, H = window.innerHeight, vp = $('#viewport');
    let k = Math.min(W / 1600, H / 900);
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const touch = coarse || k < 0.6;
    const inGame = $('#screen-game').classList.contains('on');
    let rail = 0;
    if (touch && inGame) {
      const gutter = W - 1600 * k;
      if (gutter >= 84) rail = Math.min(176, Math.max(84, gutter - 8));
      else if (W / H > 1.55) { rail = 92; k = Math.min((W - rail) / 1600, H / 900); }
    }
    UI.touch = touch;
    vp.classList.toggle('touch', touch);
    vp.classList.toggle('has-rail', rail > 0);
    $('#rail').style.width = rail + 'px';
    const st = $('#stage');
    st.style.transform = `translate(${(W - rail - 1600 * k) / 2}px,${(H - 900 * k) / 2}px) scale(${k})`;
    FX.scale = k;
  };

  /* ---------------- 触控：大卡面面板 ---------------- */
  UI.sheet = function (id, actions, note) {
    const sh = $('#sheet'), H = window.innerHeight, W = window.innerWidth;
    const ch = Math.min(H * 0.8, 560, (W * 0.5) * 1.4), cw = Math.round(ch / 1.4);
    const c = makeCard(id); c.style.setProperty('--cw', cw + 'px'); c.classList.add('sheet-card');
    sh.querySelector('.sh-card').replaceChildren(c);
    sh.querySelector('.sh-tip').innerHTML = note || '';
    const btns = sh.querySelector('.sh-btns'); btns.innerHTML = '';
    for (const a of actions.concat([{ label: '关闭' }])) {
      const b = document.createElement('button');
      b.className = 'btn big ' + (a.primary ? 'gold' : 'ghost'); b.textContent = a.label; b.disabled = !!a.disabled;
      b.onclick = () => { UI.closeSheet(); if (a.run) a.run(); };
      btns.appendChild(b);
    }
    sh.classList.remove('hidden');
  };
  UI.closeSheet = () => $('#sheet').classList.add('hidden');
  function useSheet() { return UI.touch && UI.lastPointer !== 'mouse'; }
  /* 设置：点牌确认（默认关闭——点一下手牌直接打出、点市场直接购买） */
  const SKEY = 'naiwa.settings.v1';
  UI.settings = (() => { const d = { confirmTap: false }; try { return Object.assign(d, JSON.parse(localStorage.getItem(SKEY)) || {}); } catch (e) { return d; } })();
  UI.setSetting = (k, v) => { UI.settings[k] = v; try { localStorage.setItem(SKEY, JSON.stringify(UI.settings)); } catch (e) { /* 仅内存 */ } };
  function confirmTap() { return !!UI.settings.confirmTap; }
  function tipFor(cardEl) { return previewTip(cardEl, cardEl.dataset.id); }

  /* ---------------- 触控：侧栏按钮状态 ---------------- */
  UI.renderRail = function () {
    const r = $('#rail'); if (!r || !UI.view) return;
    const end = $('#btnEnd'), all = $('#btnAll'), drw = $('#btnDraw');
    const re = r.querySelector('[data-rail="end"]');
    re.disabled = end.disabled; re.classList.toggle('warn', end.classList.contains('warn')); re.classList.toggle('glow', end.classList.contains('glow'));
    re.innerHTML = end.classList.contains('warn') ? '确认<br>结束' : '结束<br>回合';
    r.querySelector('[data-rail="all"]').disabled = all.disabled;
    const d = r.querySelector('[data-rail="draw"]'); d.disabled = drw.disabled; d.innerHTML = `抽牌<small>奶劲 ${UI.disp ? UI.disp[UI.viewer].energy : 0}</small>`;
  };

  UI.bindRail = function () {
    $('#rail').addEventListener('click', e => {
      const b = e.target.closest('[data-rail]'); if (!b || b.disabled) return;
      const k = b.dataset.rail;
      if (k === 'end') UI.endTurn(); else if (k === 'all') UI.playAll(); else if (k === 'draw') UI.submit({ type: 'drawExtra' }); else if (k === 'menu') NW.Screens.menu();
    });
    $('#sheet').addEventListener('click', e => { if (e.target.classList.contains('sh-back')) UI.closeSheet(); });
  };
  UI.bind = bind;
})(window);
