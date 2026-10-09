/* 奶蛙领域 · 规则引擎
 *
 * 设计要点（PvP / PvE 的地基）：
 *  1. 状态是纯 JSON：可存档、可网络同步、可回放。
 *  2. 一切改变都通过动作 apply(state, action) 发生，动作带 seat，引擎负责校验合法性。
 *  3. 随机数来自状态内的种子（mulberry32）。同一种子 + 同一动作序列 ⇒ 同一结果（锁步联机 / 回放）。
 *  4. apply 返回事件列表（events），表现层只根据事件和新状态做动画，不读引擎内部。
 *  5. view(state, seat) 生成某一方视角（隐藏对手手牌与牌库顺序），用于权威服务器下发。
 *  6. PvE 关卡通过 mutators（钩子）和 objective（胜利条件）扩展规则，不改引擎代码。
 *
 * 动作（Action）一览：
 *   {type:'play',      seat, uid, replace?}   打出手牌；雕塑满 3 座时需给出被替换雕塑 replace
 *   {type:'buy',       seat, slot}            购买市场牌：slot 为 0..4 或 'p:errand'
 *   {type:'drawExtra', seat}                  消耗 1 奶劲抽 1 张
 *   {type:'attack',    seat, target}          target='hero' 或对手雕塑 uid
 *   {type:'scrap',     seat, uid}             献祭本回合已打出的牌
 *   {type:'choose',    seat, value}           回应待决选择（uid 或 'skip'）
 *   {type:'undoTrash', seat}                  撤回西格奶删牌区中的牌
 *   {type:'endTurn',   seat}
 *   {type:'concede',   seat}
 */
(function (root) {
  'use strict';
  const NW = root.NW = root.NW || {};
  if (typeof require === 'function' && !NW.CARDS) { try { Object.assign(NW, require('./cards.js')); } catch (e) { /* 浏览器环境 */ } }

  const ENGINE_VERSION = 6;
  const DEFAULT_RULES = {
    hp: 30,                // 初始生命
    handSize: 5,           // 每回合抽牌数
    firstHand: 5,          // 先手首回合抽牌数（PvP 建议 3）
    marketSize: 5,         // 市场格数
    statueLimit: 3,        // 雕塑上限
    startDeck: { baby: 7, laugh: 2, kungfu: 1 },
    permanent: ['errand'], // 常驻市场
    pool: null,            // null = NW.DEFAULT_POOL
    turnLimit: 0,          // 0 = 不限
    eliteTrashCost: 5,     // 招募基础价格 ≥ 此值的牌时，可删除手牌或弃牌堆中 1 张牌（0 = 关闭）
    buyTo: 'discard',
    marketTrashCost: 4,    // 删牌机会也可以用来移除市场中价格 ≤ 此值的牌（0 = 不允许）      // 购入的牌去向：'discard' 弃牌堆 | 'deck' 洗入抽牌堆 | 'top' 抽牌堆顶
  };

  /* ---------------- 工具 ---------------- */
  const card = (state, uid) => NW.CARDS[state.cards[uid]];
  const other = s => 1 - s;
  const clone = o => JSON.parse(JSON.stringify(o));

  function rng(state) { // mulberry32，状态保存在 state.rng
    let t = (state.rng = (state.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(state, arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng(state) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  function mint(state, id) { const uid = 'u' + (state.nextUid++); state.cards[uid] = id; return uid; }
  function ev(state, e) { state._ev.push(e); }
  function log(state, seat, text) {
    state.log.push({ r: state.round, s: seat, text });
    if (state.log.length > 160) state.log.splice(0, state.log.length - 160);
  }
  function nameOf(state, seat) { return seat == null ? '' : state.seats[seat].name; }

  /* ---------------- 创建对局 ---------------- */
  /**
   * @param {object} o
   *  seed        随机种子（整数）
   *  rules       覆盖 DEFAULT_RULES
   *  first       先手座位（0/1）
   *  seats       [{name, portrait, hp, deck:{id:n}|[ids], statues:[ids], extraCards:[ids]}, ...]
   *  mutators    [{id, seat?, params?}]  —— 关卡规则改造，见 levels.js
   *  objective   {type:'defeat'} | {type:'survive', rounds, seat} | {type:'breakStatues', n, seat}
   *  meta        任意附加信息（模式、关卡 id…），引擎不读取
   */
  function createMatch(o = {}) {
    const rules = Object.assign({}, DEFAULT_RULES, o.rules || {});
    const seed = (o.seed == null ? Math.floor(Math.random() * 2 ** 31) : o.seed) | 0;
    const state = {
      v: ENGINE_VERSION, seed, rng: seed, rules,
      round: 1, turnNo: 0, active: o.first || 0, first: o.first || 0,
      winner: null, endReason: null, over: false,
      cards: {}, nextUid: 1,
      seats: [], market: [], supply: [], trash: [],
      pending: null, queue: [],
      log: [], mutators: o.mutators || [], objective: o.objective || { type: 'defeat' },
      meta: o.meta || {}, actionNo: 0, _ev: [],
    };
    const seatsIn = o.seats || [{}, {}];
    for (let i = 0; i < 2; i++) {
      const s = seatsIn[i] || {};
      const hp = s.hp || rules.hp;
      const p = {
        name: s.name || (i === 0 ? '玩家一' : '玩家二'), portrait: s.portrait || (i === 0 ? 'kungfu' : 'guard'), tint: s.tint || null,
        hp, maxHp: hp, deck: [], hand: [], discard: [], played: [], statues: [],
        coin: 0, energy: 0, power: 0, held: 0, shield: 0, trashOps: [], recallOps: [],
        guards: [], pierce: false, nextPierce: false, lost: 0, // 守势状态（持续到自己下回合开始）/ 本回合破壳 / 本回合已失去的生命
        status: [], once: {}, allyDone: {}, topdeck: false, incomingDiscard: 0, limbo: null,
        trash: [], // 删牌区：本回合自己删掉或献祭的牌，公开；回合结束时清空（永久移出游戏）。本回合内可以被「取回」放回弃牌堆
        stats: { dmg: 0, bought: 0, trashed: 0, broke: 0, played: 0, healed: 0, maxPower: 0, allies: 0, absorbed: 0, statuesPlayed: 0, extraDraws: 0, thorns: 0, capped: 0, statusPlayed: 0, drawn: 0, maxTurnPlays: 0, bigHit: 0, maxTurnHeroHits: 0, trashedIds: {}, recalled: 0 },
        turnPlays: 0, turnHeroHits: 0,
      };
      let deckIds = [];
      const d = s.deck || rules.startDeck;
      if (Array.isArray(d)) deckIds = d.slice(); else for (const [id, n] of Object.entries(d)) for (let k = 0; k < n; k++) deckIds.push(id);
      if (s.extraCards) deckIds.push(...s.extraCards);
      // fixedOrder：deck 按抽牌顺序给出（教学关用），否则洗牌
      p.deck = s.fixedOrder ? deckIds.map(id => mint(state, id)).reverse() : shuffle(state, deckIds.map(id => mint(state, id)));
      for (const id of (s.statues || [])) p.statues.push({ uid: mint(state, id), hp: NW.CARDS[id].hp });
      state.seats.push(p);
    }
    refillSupply(state);
    for (let i = 0; i < rules.marketSize; i++) {
      const want = rules.fixedMarket && rules.fixedMarket[i]; // 教学关固定开局市场
      if (want) { const k = state.supply.indexOf(state.supply.find(u => state.cards[u] === want)); state.market[i] = k >= 0 ? state.supply.splice(k, 1)[0] : mint(state, want); }
      else state.market[i] = drawSupply(state);
    }
    hook(state, 'setup');
    // 预置雕塑也应用雕塑耐久修正
    for (let i = 0; i < 2; i++) for (const st of state.seats[i].statues) st.hp = statueHp(state, i, st.uid);
    startTurn(state, state.active, true);
    state._ev = [];
    return state;
  }

  function poolIds(state) { return state.rules.pool || NW.DEFAULT_POOL; }
  function refillSupply(state) { state.supply = shuffle(state, poolIds(state).map(id => mint(state, id))); }
  function drawSupply(state) { if (!state.supply.length) refillSupply(state); return state.supply.pop() || null; }

  /* ---------------- 钩子（PvE mutators） ---------------- */
  function hookApi(state) {
    return {
      gain: (seat, res, n) => gain(state, seat, res, n, { src: 'mutator' }),
      draw: (seat, n) => draw(state, seat, n),
      damage: (seat, n, src) => damage(state, seat, n, src || 'mutator'),
      heal: (seat, n) => heal(state, seat, n),
      shield: (seat, n) => { state.seats[seat].shield += n; ev(state, { t: 'shield', seat, n, total: state.seats[seat].shield, src: 'mutator' }); },
      addStatue: (seat, id) => { const uid = mint(state, id); state.seats[seat].statues.push({ uid, hp: statueHp(state, seat, uid) }); ev(state, { t: 'statueSummon', seat, uid }); return uid; },
      replaceMarket: i => { const old = state.market[i]; state.market[i] = drawSupply(state); ev(state, { t: 'marketChurn', slot: i, old, uid: state.market[i] }); },
      addToDiscard: (seat, id) => { const uid = mint(state, id); state.seats[seat].discard.push(uid); ev(state, { t: 'gift', seat, uid }); return uid; },
      log: (seat, text) => log(state, seat, text),
      banner: (text, sub) => ev(state, { t: 'banner', text, sub }),
      rng: () => rng(state),
      card: uid => card(state, uid),
    };
  }
  function hook(state, name, ...args) {
    let out;
    for (const m of state.mutators) {
      const impl = NW.MUTATORS && NW.MUTATORS[m.id];
      if (impl && typeof impl[name] === 'function') {
        const r = impl[name](state, hookApi(state), m, ...args);
        if (r !== undefined) out = r;
      }
    }
    return out;
  }
  function statueHp(state, seat, uid) {
    let hp = card(state, uid).hp;
    for (const m of state.mutators) {
      const impl = NW.MUTATORS && NW.MUTATORS[m.id];
      if (impl && impl.statueHp) hp = impl.statueHp(state, m, seat, uid, hp);
    }
    return hp;
  }

  /* ---------------- 基础操作 ---------------- */
  function draw(state, seat, n = 1) {
    const p = state.seats[seat]; const got = [];
    for (let i = 0; i < n; i++) {
      if (!p.deck.length) {
        if (!p.discard.length) break;
        p.deck = shuffle(state, p.discard); p.discard = [];
        ev(state, { t: 'shuffle', seat, n: p.deck.length });
      }
      const uid = p.deck.pop(); p.hand.push(uid); got.push(uid);
    }
    if (got.length) { p.stats.drawn += got.length; ev(state, { t: 'draw', seat, uids: got }); }
    return got.length;
  }

  function gain(state, seat, res, n, ctx = {}) {
    if (!n) return 0;
    const p = state.seats[seat];
    p[res] += n;
    if (res === 'power') p.stats.maxPower = Math.max(p.stats.maxPower, p.power);
    if (ctx.track) ctx.track[res] = (ctx.track[res] || 0) + n;
    ev(state, { t: 'gain', seat, res, n, src: ctx.src || null, phase: ctx.phase || null });
    return n;
  }

  function heal(state, seat, n) {
    const p = state.seats[seat];
    const real = Math.max(0, Math.min(n, p.maxHp - p.hp)); // 生命上限 = 初始生命
    p.hp += real; p.stats.healed += real;
    ev(state, { t: 'heal', seat, n: real, wanted: n });
  }

  /** 守势状态数值（同名叠加） */
  function guardValue(p, key) { let v = 0; for (const g of p.guards || []) { const d = NW.CARDS[g.id]; if (d.guard && d.guard[key]) v = key === 'cap' ? (v ? Math.min(v, d.guard[key]) : d.guard[key]) : v + d.guard[key]; } return v; }

  function damage(state, seat, n, src) {
    const p = state.seats[seat];
    const mod = hook(state, 'modifyDamage', seat, n, src);
    if (typeof mod === 'number') n = Math.max(0, mod);
    // 奶壳先吸收伤害（持续到该玩家下个回合开始）；破壳的攻击无视奶壳
    const pierce = src === 'attack' && state.seats[other(seat)].pierce;
    const absorbed = pierce ? 0 : Math.min(p.shield || 0, n);
    if (absorbed) { p.shield -= absorbed; n -= absorbed; p.stats.absorbed += absorbed; log(state, seat, `${p.name} 的奶壳挡下了 ${absorbed} 点伤害`); }
    // 守势·生命上限：本回合最多失去 cap 点生命
    const cap = guardValue(p, 'cap');
    if (cap) { const room = Math.max(0, cap - p.lost); if (n > room) { p.stats.capped += n - room; ev(state, { t: 'guardCap', seat, cut: n - room, cap }); log(state, seat, `${p.name} 的惊鸿一瞥挡掉了 ${n - room} 点伤害`); n = room; } }
    const before = p.hp;
    p.hp = Math.max(0, p.hp - n); p.lost += before - p.hp;
    state.seats[other(seat)].stats.dmg += before - p.hp;
    ev(state, { t: 'damage', seat, n, absorbed, shield: p.shield, src, hp: p.hp, pierce: pierce && (p.shield > 0 || undefined) });
    if (p.hp <= 0) endGame(state, other(seat), 'hp');
  }

  function endGame(state, winner, reason) {
    if (state.over) return;
    state.over = true; state.winner = winner; state.endReason = reason;
    state.pending = null; state.queue = [];
    ev(state, { t: 'gameOver', winner, reason });
    log(state, winner, `${nameOf(state, winner)} 获得胜利！`);
  }

  /* ---------------- 条件与效果解释器 ---------------- */
  // 双类型牌（alsoChar）：既是状态牌也算角色牌
  const isChar = d => d.type === 'char' || !!d.alsoChar;
  function cond(state, seat, c) {
    const p = state.seats[seat];
    switch (c) {
      case 'hasStatue': return p.statues.length > 0;
      case 'otherStatue': return p.statues.length > 1;
      case 'hasEnergy': return p.energy > 0;
      case 'charsInHand2': return p.hand.filter(u => isChar(card(state, u))).length >= 2;
      default: return false;
    }
  }

  function runEffects(state, seat, effects, ctx) {
    if (!effects) return;
    const p = state.seats[seat];
    for (const e of effects) {
      if (state.over) return;
      if (e.if) { runEffects(state, seat, cond(state, seat, e.if) ? e.then : e.else, ctx); continue; }
      if (e.once) { if (p.once[e.once]) continue; p.once[e.once] = true; runEffects(state, seat, e.then, ctx); continue; }
      if (e.gain) { gain(state, seat, e.gain, e.n, ctx); continue; }
      if (e.draw) { draw(state, seat, e.draw); continue; }
      if (e.heal) { heal(state, seat, e.heal); continue; }
      if (e.shield) { p.shield += e.shield; ev(state, { t: 'shield', seat, n: e.shield, total: p.shield, src: ctx.src || null }); continue; }
      if (e.oppDiscard) { state.seats[other(seat)].incomingDiscard += e.oppDiscard; ev(state, { t: 'curse', seat: other(seat), n: e.oppDiscard, src: ctx.src }); log(state, seat, `${nameOf(state, other(seat))} 下回合需弃 ${e.oppDiscard} 张牌`); continue; }
      if (e.pierce) { p.pierce = true; ev(state, { t: 'pierce', seat, src: ctx.src }); log(state, seat, `${p.name} 本回合的攻击无视奶壳`); continue; }
      if (e.shieldBank) { p.shieldBank = true; ev(state, { t: 'shieldBank', seat, src: ctx.src || null }); continue; }
      if (e.topdeckNext) { p.topdeck = true; ev(state, { t: 'topdeck', seat, src: ctx.src }); continue; }
      if (e.marketTrash) { enqueue(state, { seat, kind: 'marketTrash', maxCost: e.marketTrash.maxCost || 99, optional: true, src: ctx.src, prompt: `可从市场移除 1 张价格 ≤ ${e.marketTrash.maxCost || 99} 的牌` }); continue; }
      // 删牌不再立即弹出选择，而是给一次「删牌机会」，由玩家在本回合内主动使用
      if (e.trash) { grantTrash(state, seat, e.trash.from, ctx.src); continue; }
      if (e.sigmaTrash) { grantTrash(state, seat, ['hand', 'discard', 'deck'], ctx.src); continue; }
      if (e.destroyStatue) {
        if (state.seats[other(seat)].statues.length) enqueue(state, { seat, kind: 'destroyStatue', maxHp: e.destroyStatue.maxHp || 99, optional: e.destroyStatue.optional !== false, src: ctx.src, prompt: '选择要击碎的对手雕塑' });
        continue;
      }
      if (e.recall) { // 取回机会：和删牌机会一样主动使用（点删牌区），回合结束失效
        const r = e.recall, op = { src: ctx.src || null, to: r.to || 'discard', maxCost: r.maxCost == null ? 99 : r.maxCost };
        p.recallOps.push(op);
        ev(state, { t: 'recallOp', seat, n: p.recallOps.length, src: op.src });
        continue;
      }
      if (e.discardSelf) { const n = Math.min(e.discardSelf, p.hand.length); if (n) enqueue(state, { seat, kind: 'discard', n, optional: false, src: ctx.src, prompt: `选择 ${n} 张手牌弃掉` }); continue; }
    }
  }

  /** 自己的牌进入删牌区 */
  function toTrash(state, seat, uid) { state.seats[seat].trash.push(uid); }
  function noteTrash(state, seat, uid) { const t = state.seats[seat].stats.trashedIds, id = state.cards[uid]; t[id] = (t[id] || 0) + 1; }

  /* ---------------- 删牌机会（主动使用，回合结束失效） ---------------- */
  function grantTrash(state, seat, from, src) {
    const op = { src: src || null, from: from.slice(), market: state.rules.marketTrashCost || 0 };
    state.seats[seat].trashOps.push(op);
    ev(state, { t: 'trashOp', seat, n: state.seats[seat].trashOps.length, src: op.src });
  }
  function trashTargets(state, seat, op) {
    const p = state.seats[seat], out = [];
    for (const z of op.from.includes('played') ? op.from : op.from.concat('played')) for (const u of (p[z] || [])) out.push({ uid: u, zone: z }); // 出牌区的牌也能删
    if (op.market) for (const u of state.market) if (u && card(state, u).cost <= op.market) out.push({ uid: u, zone: 'market' });
    return out;
  }

  /** 取回机会可选的牌：本回合删牌区里费用不超过上限的牌 */
  function recallTargets(state, seat, op) { return state.seats[seat].trash.filter(u => (card(state, u).cost || 0) <= op.maxCost); }

  /* ---------------- 待决选择队列 ---------------- */
  function enqueue(state, choice) {
    state.queue.push(choice);
    if (!state.pending) nextPending(state);
  }
  function nextPending(state) {
    while (state.queue.length) {
      const c = state.queue.shift();
      if (pendingOptions(state, c).length || c.kind === 'discard') { // discard 必定有选项（已按手牌数截断）
        if (c.kind === 'discard' && !state.seats[c.seat].hand.length) continue;
        state.pending = c; ev(state, { t: 'pending', seat: c.seat, kind: c.kind, src: c.src || null });
        return;
      }
    }
    state.pending = null;
  }
  function pendingOptions(state, c) {
    const p = state.seats[c.seat];
    switch (c.kind) {
      case 'discard': return p.hand.slice();
      case 'trash': return [].concat(c.from.includes('hand') ? p.hand : [], c.from.includes('discard') ? p.discard : []);
      case 'sigma': return [].concat(p.hand, p.deck);
      case 'destroyStatue': return state.seats[other(c.seat)].statues.filter(s => s.hp <= c.maxHp).map(s => s.uid);
      case 'marketTrash': return state.market.filter(u => u && card(state, u).cost <= c.maxCost);
      default: return [];
    }
  }

  function resolveChoice(state, seat, value) {
    const c = state.pending, p = state.seats[seat];
    if (value === 'skip') {
      if (!c.optional) return '此选择不能跳过';
      log(state, seat, `${p.name} 跳过了选择`);
      ev(state, { t: 'skip', seat, kind: c.kind });
      state.pending = null; nextPending(state); return null;
    }
    if (!pendingOptions(state, c).includes(value)) return '无效的选择';
    const id = state.cards[value], name = NW.CARDS[id].name;
    if (c.kind === 'discard') {
      p.hand.splice(p.hand.indexOf(value), 1); p.discard.push(value);
      ev(state, { t: 'discard', seat, uid: value }); log(state, seat, `${p.name} 弃掉了 ${name}`);
      c.n--; if (c.n > 0 && p.hand.length) { c.prompt = `再选择 ${c.n} 张手牌弃掉`; return null; }
    } else if (c.kind === 'trash') {
      const zone = p.hand.includes(value) ? 'hand' : 'discard';
      p[zone].splice(p[zone].indexOf(value), 1); toTrash(state, seat, value); p.stats.trashed++; noteTrash(state, seat, value);
      ev(state, { t: 'trash', seat, uid: value, from: zone }); log(state, seat, `${p.name} 删除了 ${name}`);
    } else if (c.kind === 'sigma') {
      const zone = p.hand.includes(value) ? 'hand' : 'deck', idx = p[zone].indexOf(value);
      p[zone].splice(idx, 1); p.limbo = { uid: value, from: zone, index: idx };
      ev(state, { t: 'limbo', seat, uid: value, from: zone }); log(state, seat, `${p.name} 将 ${name} 移入删牌区`);
    } else if (c.kind === 'marketTrash') {
      const i = state.market.indexOf(value); state.trash.push(value); state.market[i] = drawSupply(state);
      ev(state, { t: 'marketChurn', slot: i, old: value, uid: state.market[i], by: seat }); log(state, seat, `${p.name} 从市场移除了 ${name}`);
    } else if (c.kind === 'destroyStatue') {
      breakStatue(state, other(seat), value, seat, 'effect');
    }
    state.pending = null; nextPending(state); return null;
  }

  /* ---------------- 阵营联动 ---------------- */
  function factionAt(state, uid) { return card(state, uid).faction; }
  function checkAllies(state, seat) {
    const p = state.seats[seat];
    let fired = true;
    while (fired && !state.over) {
      fired = false;
      const presence = p.played.concat(p.statues.map(s => s.uid));
      for (const uid of presence) {   // 雕塑也可以有联动（奶羊），每回合一次
        const d = card(state, uid);
        if (!d.ally || p.allyDone[uid] || d.faction === 'neutral') continue;
        const partner = presence.find(u => u !== uid && factionAt(state, u) === d.faction);
        if (!partner) continue;
        p.allyDone[uid] = true; fired = true; p.stats.allies++;
        ev(state, { t: 'ally', seat, uid, partner, faction: d.faction });
        log(state, seat, `${d.name} 触发 ${NW.FACTIONS[d.faction].name} 联动`);
        runEffects(state, seat, d.ally, { src: uid, phase: 'ally' });
      }
    }
  }

  /* ---------------- 回合流程 ---------------- */
  function startTurn(state, seat, first) {
    const p = state.seats[seat];
    state.active = seat; state.turnNo++;
    if (p.shield) ev(state, { t: 'shieldFade', seat, n: p.shield });
    if (p.guards.length) { ev(state, { t: 'guardFade', seat, ids: p.guards.map(g => g.id) }); p.guards = []; }
    state.seats[0].lost = state.seats[1].lost = 0; p.pierce = !!p.nextPierce; p.nextPierce = false;
    if (p.pierce) ev(state, { t: 'pierce', seat, src: 'hold' });
    p.coin = 0; p.energy = 0; p.power = p.held; p.held = 0;
    // 奶壳在自己回合开始时消失（实验规则 shieldKeep：保留一部分 / shieldToCoin：剩下的奶壳换奶蛋）
    const sh = p.shield; p.shield = 0;
    if (sh && state.rules.shieldKeep) p.shield = Math.min(state.rules.shieldCap || 99, Math.floor(sh * state.rules.shieldKeep));
    p.pendingCoin = sh && state.rules.shieldToCoin ? Math.floor(sh / state.rules.shieldToCoin) : 0;
    if (p.shieldBank) { p.pendingCoin += sh; p.shieldBank = false; }  // 奶蛋守护者：没用掉的奶壳 1:1 变奶蛋
    p.status = []; p.once = {}; p.allyDone = {}; p.topdeck = false; p.trashOps = []; p.recallOps = []; p.turnPlays = 0; p.turnHeroHits = 0;
    ev(state, { t: 'turnStart', seat, round: state.round, carried: p.power });
    if (p.pendingCoin) { gain(state, seat, 'coin', p.pendingCoin, { phase: 'shield' }); p.pendingCoin = 0; }
    if (p.power) log(state, seat, `憋笑保存的 ${p.power} 奶之力释放了`);
    draw(state, seat, first && seat === state.first && state.round === 1 ? state.rules.firstHand : state.rules.handSize);
    if (p.incomingDiscard) {
      const n = Math.min(p.incomingDiscard, p.hand.length); p.incomingDiscard = 0;
      if (n) enqueue(state, { seat, kind: 'discard', n, optional: false, src: 'curse', prompt: `受到压制：选择 ${n} 张手牌弃掉` });
    }
    for (const st of p.statues.slice()) {
      const d = card(state, st.uid);
      if (d.turnStart) { ev(state, { t: 'statueTrigger', seat, uid: st.uid }); runEffects(state, seat, d.turnStart, { src: st.uid, phase: 'statue' }); }
    }
    hook(state, 'turnStart', seat);
  }

  function endTurn(state, seat) {
    const p = state.seats[seat];
    p.held = p.status.includes('hold') ? p.power : 0;
    p.nextPierce = p.status.includes('hold');
    if (p.held) log(state, seat, `${p.name} 憋住了 ${p.held} 奶之力`);
    if (p.limbo) { toTrash(state, seat, p.limbo.uid); p.stats.trashed++; noteTrash(state, seat, p.limbo.uid); ev(state, { t: 'trash', seat, uid: p.limbo.uid, from: 'limbo' }); log(state, seat, `${p.name} 永久删去了 ${card(state, p.limbo.uid).name}`); p.limbo = null; }
    // 删牌区回合结束清空：本回合删掉 / 献祭的牌永久移出游戏
    if (p.trash.length) { const uids = p.trash.slice(); state.trash.push(...uids); p.trash = []; ev(state, { t: 'trashPurge', seat, uids, ids: uids.map(u => state.cards[u]) }); }
    const moved = p.hand.concat(p.played);
    p.discard.push(...p.hand, ...p.played); p.hand = []; p.played = [];
    p.coin = p.energy = p.power = 0; p.status = []; p.topdeck = false; p.trashOps = []; p.recallOps = []; p.pierce = false;
    ev(state, { t: 'cleanup', seat, uids: moved });
    hook(state, 'turnEnd', seat);
    if (state.over) return;
    const next = other(seat);
    if (next === state.first) {
      hook(state, 'roundEnd', state.round);
      checkObjective(state, 'roundEnd');
      if (state.over) return;
      state.round++;
      if (state.rules.turnLimit && state.round > state.rules.turnLimit) {
        const a = state.seats[0].hp, b = state.seats[1].hp;
        endGame(state, a === b ? state.first ^ 1 : (a > b ? 0 : 1), 'turnLimit'); return;
      }
    }
    startTurn(state, next, false);
  }

  function checkObjective(state, when) {
    const o = state.objective; if (!o || state.over) return;
    const seat = o.seat || 0;
    if (o.type === 'survive' && when === 'roundEnd' && state.round >= o.rounds) endGame(state, seat, 'survive');
    if (o.type === 'breakStatues' && state.seats[seat].stats.broke >= o.n) endGame(state, seat, 'objective');
  }

  function breakStatue(state, ownerSeat, uid, bySeat, how) {
    const owner = state.seats[ownerSeat];
    const i = owner.statues.findIndex(s => s.uid === uid); if (i < 0) return;
    owner.statues.splice(i, 1); owner.discard.push(uid);
    state.seats[bySeat].stats.broke++;
    ev(state, { t: 'statueBroken', seat: ownerSeat, uid, by: bySeat, how });
    log(state, bySeat, `${nameOf(state, bySeat)} 击碎了 ${card(state, uid).name}`);
    checkObjective(state, 'statue');
  }

  /* ---------------- 动作校验 ---------------- */
  function check(state, a) {
    if (!a || typeof a !== 'object') return '无效动作';
    if (state.over) return '对局已结束';
    const seat = a.seat;
    if (seat !== 0 && seat !== 1) return '缺少座位';
    if (a.type === 'concede') return null;
    if (state.pending) {
      if (state.pending.seat !== seat) return '等待对方做出选择';
      if (a.type !== 'choose') return '请先完成当前选择';
      return null;
    }
    if (a.type === 'choose') return '当前没有需要选择的事项';
    if (state.active !== seat) return '还没轮到你';
    const p = state.seats[seat], o = state.seats[other(seat)];
    switch (a.type) {
      case 'play': {
        if (!p.hand.includes(a.uid)) return '这张牌不在手牌中';
        const d = card(state, a.uid);
        if (d.type === 'statue' && p.statues.length >= state.rules.statueLimit) {
          if (!a.replace || !p.statues.some(s => s.uid === a.replace)) return `雕塑最多 ${state.rules.statueLimit} 座，需要选择替换`;
        }
        return null;
      }
      case 'buy': {
        const id = buyId(state, a.slot); if (!id) return '该位置没有牌';
        const cost = buyCost(state, seat, id);
        if (p.coin < cost) return `奶蛋不足（需要 ${cost}）`;
        return null;
      }
      case 'drawExtra':
        if (p.energy < 1) return '没有奶劲';
        if (!p.deck.length && !p.discard.length) return '没有可抽的牌';
        return null;
      case 'attack': {
        if (a.target === 'hero') {
          if (o.statues.some(s => card(state, s.uid).taunt)) return '对方有嘲讽雕塑，必须先击破';
          if (p.power < 1) return '没有奶之力';
          return null;
        }
        const s = o.statues.find(x => x.uid === a.target);
        if (!s) return '目标不存在';
        if (p.power < s.hp) return `击碎 ${card(state, s.uid).name} 需要 ${s.hp} 奶之力`;
        return null;
      }
      case 'scrap': {
        if (!p.played.includes(a.uid)) return '只能献祭本回合打出的牌';
        if (!card(state, a.uid).scrap) return '这张牌没有献祭能力';
        return null;
      }
      case 'undoTrash': return p.limbo ? null : '删牌区是空的';
      case 'useRecall': {
        const op = (p.recallOps || [])[a.op | 0]; if (!op) return '没有可用的取回机会';
        if (!recallTargets(state, seat, op).includes(a.value)) return '这张牌不能取回';
        return null;
      }
      case 'useTrash': {
        const op = p.trashOps[a.op | 0]; if (!op) return '没有可用的删牌机会';
        if (!trashTargets(state, seat, op).some(t => t.uid === a.value)) return '这张牌不能删除';
        return null;
      }
      case 'endTurn': return null;
      default: return '未知动作';
    }
  }

  function buyId(state, slot) {
    if (typeof slot === 'string' && slot.startsWith('p:')) { const id = slot.slice(2); return state.rules.permanent.includes(id) ? id : null; }
    const uid = state.market[slot]; return uid ? state.cards[uid] : null;
  }
  function buyCost(state, seat, id) {
    let cost = NW.CARDS[id].cost;
    for (const m of state.mutators) { const impl = NW.MUTATORS && NW.MUTATORS[m.id]; if (impl && impl.cost) cost = impl.cost(state, m, seat, id, cost); }
    return Math.max(0, cost);
  }

  /* ---------------- 执行动作 ---------------- */
  function apply(state, a) {
    const err = check(state, a);
    if (err) return { ok: false, error: err, events: [] };
    state._ev = []; state.actionNo++;
    const seat = a.seat, p = state.seats[seat], o = state.seats[other(seat)];
    switch (a.type) {
      case 'concede': endGame(state, other(seat), 'concede'); break;
      case 'choose': {
        const e = resolveChoice(state, seat, a.value);
        if (e) return { ok: false, error: e, events: [] };
        break;
      }
      case 'play': doPlay(state, seat, a); break;
      case 'buy': {
        const id = buyId(state, a.slot), cost = buyCost(state, seat, id);
        p.coin -= cost; p.stats.bought++;
        let uid;
        if (typeof a.slot === 'string') uid = mint(state, id);
        else { uid = state.market[a.slot]; state.market[a.slot] = drawSupply(state); }
        const mode = p.topdeck ? 'top' : (state.rules.buyTo || 'discard');
        const to = mode === 'discard' ? 'discard' : 'deck';
        if (mode === 'top') p.deck.push(uid);
        else if (mode === 'deck') p.deck.splice(Math.floor(rng(state) * (p.deck.length + 1)), 0, uid);
        else p.discard.push(uid);
        p.topdeck = false;
        ev(state, { t: 'buy', seat, uid, slot: a.slot, to, cost, refill: typeof a.slot === 'number' ? state.market[a.slot] : null });
        log(state, seat, `${p.name} 用 ${cost} 奶蛋招募了 ${NW.CARDS[id].name}${to === 'deck' ? '（置于牌库顶）' : ''}`);
        if (state.rules.eliteTrashCost && !NW.CARDS[id].permanent && NW.CARDS[id].cost >= state.rules.eliteTrashCost)
          grantTrash(state, seat, ['hand', 'discard'], uid);
        hook(state, 'afterBuy', seat, uid);
        break;
      }
      case 'drawExtra':
        p.energy--; p.stats.extraDraws++; ev(state, { t: 'spend', seat, res: 'energy', n: 1 });
        draw(state, seat, 1); log(state, seat, `${p.name} 消耗奶劲多抽了一张`);
        break;
      case 'attack':
        if (a.target === 'hero') {
          const n = p.power; p.power = 0;
          ev(state, { t: 'attack', seat, target: 'hero', n });
          log(state, seat, `${p.name} 对 ${o.name} 造成 ${n} 点伤害`);
          const hp0 = o.hp; damage(state, other(seat), n, 'attack'); p.stats.bigHit = Math.max(p.stats.bigHit, hp0 - o.hp);
          p.turnHeroHits++; p.stats.maxTurnHeroHits = Math.max(p.stats.maxTurnHeroHits || 0, p.turnHeroHits);
          // 守势·反伤：攻击对方本体时自己受到伤害（即使被奶壳挡住）
          const th = guardValue(o, 'thorns');
          if (th && !state.over) { o.stats.thorns += th; ev(state, { t: 'thorns', seat, n: th, from: other(seat) }); log(state, other(seat), `榴莲刺反弹了 ${th} 点伤害`); damage(state, seat, th, 'thorns'); }
        } else {
          const s = o.statues.find(x => x.uid === a.target);
          p.power -= s.hp;
          ev(state, { t: 'attack', seat, target: s.uid, n: s.hp });
          breakStatue(state, other(seat), s.uid, seat, 'attack');
        }
        break;
      case 'scrap': {
        const d = card(state, a.uid);
        p.played.splice(p.played.indexOf(a.uid), 1);
        if (d.type === 'status') { const k = p.status.indexOf(d.id); if (k >= 0) p.status.splice(k, 1); }
        toTrash(state, seat, a.uid);
        ev(state, { t: 'scrap', seat, uid: a.uid });
        log(state, seat, `${p.name} 献祭了 ${d.name}`);
        runEffects(state, seat, d.scrap, { src: a.uid, phase: 'scrap' });
        break;
      }
      case 'useTrash': {
        const op = p.trashOps[a.op | 0], t = trashTargets(state, seat, op).find(x => x.uid === a.value);
        p.trashOps.splice(a.op | 0, 1);
        const name = card(state, t.uid).name;
        if (t.zone === 'market') {
          const i = state.market.indexOf(t.uid); state.trash.push(t.uid); state.market[i] = drawSupply(state);
          ev(state, { t: 'marketChurn', slot: i, old: t.uid, uid: state.market[i], by: seat });
          log(state, seat, `${p.name} 从市场移除了 ${name}`);
        } else {
          p[t.zone].splice(p[t.zone].indexOf(t.uid), 1); toTrash(state, seat, t.uid); p.stats.trashed++; noteTrash(state, seat, t.uid);
          if (t.zone === 'played' && card(state, t.uid).type === 'status') { const k = p.status.indexOf(state.cards[t.uid]); if (k >= 0) p.status.splice(k, 1); }
          ev(state, { t: 'trash', seat, uid: t.uid, from: t.zone });
          const gates = p.status.filter(x => NW.CARDS[x].passive === 'gate').length;
          if (gates) { gain(state, seat, 'coin', gates, { src: t.uid, phase: 'gate' }); ev(state, { t: 'passive', seat, kind: 'gate', uid: t.uid }); }
          log(state, seat, `${p.name} 删除了${{ deck: '抽牌堆中的', hand: '手牌中的', played: '出牌区的', discard: '弃牌堆中的' }[t.zone] || ''} ${name}`);
        }
        break;
      }
      case 'useRecall': {
        const op = p.recallOps.splice(a.op | 0, 1)[0], uid = a.value, name = card(state, uid).name;
        p.trash.splice(p.trash.indexOf(uid), 1); p.stats.recalled++;
        if (op.to === 'hand') p.hand.push(uid); else if (op.to === 'top') p.deck.push(uid); else p.discard.push(uid);
        ev(state, { t: 'recall', seat, uid, to: op.to, src: op.src });
        log(state, seat, `${p.name} 从删牌区取回了 ${name}${op.to === 'hand' ? '' : op.to === 'top' ? '（放到牌库顶）' : '（放入弃牌堆）'}`);
        break;
      }
      case 'undoTrash': {
        const { uid, from, index } = p.limbo; p.limbo = null;
        p[from].splice(Math.min(index, p[from].length), 0, uid);
        ev(state, { t: 'unlimbo', seat, uid, to: from });
        log(state, seat, `${p.name} 撤回了删牌区中的 ${card(state, uid).name}`);
        break;
      }
      case 'endTurn':
        log(state, seat, `${p.name} 结束回合`);
        endTurn(state, seat);
        break;
    }
    hook(state, 'afterAction', a);
    const events = state._ev; state._ev = [];
    return { ok: true, events };
  }

  function doPlay(state, seat, a) {
    const p = state.seats[seat], uid = a.uid, d = card(state, uid);
    p.hand.splice(p.hand.indexOf(uid), 1); p.stats.played++; p.turnPlays++; p.stats.maxTurnPlays = Math.max(p.stats.maxTurnPlays, p.turnPlays);
    if (d.type === 'statue') {
      if (p.statues.length >= state.rules.statueLimit) {
        const i = p.statues.findIndex(s => s.uid === a.replace);
        const old = p.statues.splice(i, 1)[0]; p.discard.push(old.uid);
        ev(state, { t: 'statueReplaced', seat, uid: old.uid });
        log(state, seat, `${p.name} 将 ${card(state, old.uid).name} 换入弃牌堆`);
      }
      p.statues.push({ uid, hp: statueHp(state, seat, uid) }); p.stats.statuesPlayed++;
      ev(state, { t: 'play', seat, uid, to: 'statue' });
      log(state, seat, `${p.name} 唤醒了 ${d.name}`);
      checkAllies(state, seat);
      hook(state, 'afterPlay', seat, uid);
      return;
    }
    p.played.push(uid);
    if (d.type === 'status') { p.status.push(d.id); p.stats.statusPlayed++; }
    if (d.guard) { p.guards.push({ id: d.id, uid }); ev(state, { t: 'guard', seat, id: d.id, uid }); }
    ev(state, { t: 'play', seat, uid, to: 'play' });
    log(state, seat, `${p.name} 打出了 ${d.name}`);
    const track = {};
    runEffects(state, seat, d.play, { src: uid, phase: 'play', track });
    // 状态被动：狂笑 / 西格奶
    if (track.power > 0) {
      const n = p.status.filter((s, i) => s === 'frenzy').length - (d.id === 'frenzy' ? 1 : 0);
      if (n > 0) { gain(state, seat, 'power', n, { src: uid, phase: 'frenzy' }); ev(state, { t: 'passive', seat, kind: 'frenzy', uid }); }
    }
    if (track.energy > 0) {
      const n = p.status.filter(s => s === 'sigma').length - (d.id === 'sigma' ? 1 : 0);
      if (n > 0) { gain(state, seat, 'energy', n, { src: uid, phase: 'sigma' }); ev(state, { t: 'passive', seat, kind: 'sigma', uid }); }
    }
    if (isChar(d)) {
      const n = p.status.filter(s => NW.CARDS[s].passive === 'army').length;
      if (n > 0) { gain(state, seat, 'power', n, { src: uid, phase: 'army' }); ev(state, { t: 'passive', seat, kind: 'army', uid }); }
    }
    // 雕塑被动
    for (const st of p.statues.slice()) {
      const sd = card(state, st.uid);
      const lists = [d.type === 'status' && sd.onStatus, isChar(d) && sd.onChar].filter(Boolean);
      for (const list of lists) { ev(state, { t: 'statueTrigger', seat, uid: st.uid }); runEffects(state, seat, list, { src: st.uid, phase: 'statue' }); }
    }
    checkAllies(state, seat);
    hook(state, 'afterPlay', seat, uid);
  }

  /* ---------------- 合法动作枚举（AI / UI 用） ---------------- */
  function legalActions(state, seat) {
    const out = [];
    const tryA = a => { if (!check(state, a)) out.push(a); };
    if (state.over) return out;
    if (state.pending) {
      if (state.pending.seat !== seat) return out;
      for (const v of pendingOptions(state, state.pending)) out.push({ type: 'choose', seat, value: v });
      if (state.pending.optional) out.push({ type: 'choose', seat, value: 'skip' });
      return out;
    }
    if (state.active !== seat) return out;
    const p = state.seats[seat], o = state.seats[other(seat)];
    for (const uid of p.hand) {
      const d = card(state, uid);
      if (d.type === 'statue' && p.statues.length >= state.rules.statueLimit) for (const s of p.statues) tryA({ type: 'play', seat, uid, replace: s.uid });
      else tryA({ type: 'play', seat, uid });
    }
    for (let i = 0; i < state.market.length; i++) tryA({ type: 'buy', seat, slot: i });
    for (const id of state.rules.permanent) tryA({ type: 'buy', seat, slot: 'p:' + id });
    tryA({ type: 'drawExtra', seat });
    tryA({ type: 'attack', seat, target: 'hero' });
    for (const s of o.statues) tryA({ type: 'attack', seat, target: s.uid });
    for (const uid of p.played) tryA({ type: 'scrap', seat, uid });
    tryA({ type: 'undoTrash', seat });
    p.trashOps.forEach((op, i) => trashTargets(state, seat, op).forEach(t => out.push({ type: 'useTrash', seat, op: i, value: t.uid })));
    p.recallOps.forEach((op, i) => recallTargets(state, seat, op).forEach(u => out.push({ type: 'useRecall', seat, op: i, value: u })));
    out.push({ type: 'endTurn', seat });
    return out;
  }

  /* ---------------- 视角（隐藏信息） ---------------- */
  /** 生成 seat 视角的只读快照；seat 为 null 时为观战视角（双方手牌都隐藏）。 */
  function view(state, seat) {
    const visible = new Set();
    const add = u => { if (u) visible.add(u); };
    const seats = state.seats.map((p, i) => {
      const mine = i === seat;
      p.played.forEach(add); p.discard.forEach(add); p.trash.forEach(add); p.statues.forEach(s => add(s.uid));
      if (mine) { p.hand.forEach(add); if (p.limbo) add(p.limbo.uid); }
      return {
        name: p.name, portrait: p.portrait, tint: p.tint, hp: p.hp, maxHp: p.maxHp,
        coin: p.coin, energy: p.energy, power: p.power, held: p.held, shield: p.shield,
        guards: clone(p.guards), pierce: p.pierce, nextPierce: p.nextPierce, lost: p.lost,
        status: p.status.slice(), played: p.played.slice(), statues: clone(p.statues), discard: p.discard.slice(), trash: p.trash.slice(),
        deckCount: p.deck.length, handCount: p.hand.length,
        deckList: mine ? p.deck.map(u => state.cards[u]).sort() : null, // 只给构成，不给顺序
        hand: mine ? p.hand.slice() : null,
        limbo: p.limbo ? (mine ? clone(p.limbo) : { hidden: true }) : null,
        trashOps: mine ? clone(p.trashOps) : p.trashOps.map(() => ({ hidden: true })),
        recallOps: clone(p.recallOps || []),
        // 删牌机会可选抽牌堆时，给出抽牌堆中的牌（按卡牌 id 排序，不泄露顺序）
        deckChoices: mine && p.trashOps.some(o => o.from.includes('deck')) ? p.deck.slice().sort((x, y) => state.cards[x] < state.cards[y] ? -1 : 1) : null,
        topdeck: p.topdeck, incomingDiscard: p.incomingDiscard, allyDone: Object.assign({}, p.allyDone),
        stats: clone(p.stats),
      };
    });
    state.market.forEach(add);
    seats.forEach(x => (x.deckChoices || []).forEach(add));
    let pending = null;
    if (state.pending) {
      pending = { seat: state.pending.seat, kind: state.pending.kind, optional: state.pending.optional, prompt: state.pending.prompt, src: state.pending.src, n: state.pending.n || 1 };
      if (state.pending.seat === seat) {
        let opts = pendingOptions(state, state.pending);
        const deck = state.seats[seat].deck;
        // 抽牌堆中的选项按卡牌 id 排序，避免泄露牌序
        opts = opts.filter(u => !deck.includes(u)).concat(opts.filter(u => deck.includes(u)).sort((x, y) => state.cards[x] < state.cards[y] ? -1 : 1));
        pending.options = opts; opts.forEach(add);
        pending.zones = {};
        for (const u of opts) pending.zones[u] = state.seats[seat].hand.includes(u) ? 'hand' : deck.includes(u) ? 'deck' : state.seats[seat].discard.includes(u) ? 'discard' : state.market.includes(u) ? 'market' : state.seats[seat].trash.includes(u) ? 'trash' : 'statue';
      }
    }
    const cards = {}; for (const u of visible) cards[u] = state.cards[u];
    return {
      v: state.v, me: seat, round: state.round, turnNo: state.turnNo, active: state.active, first: state.first,
      over: state.over, winner: state.winner, endReason: state.endReason,
      rules: state.rules, seats, market: state.market.slice(), permanent: state.rules.permanent.slice(),
      supplyCount: state.supply.length, trashCount: state.trash.length,
      pending, cards, log: state.log.slice(-60), objective: state.objective, mutators: state.mutators, meta: state.meta,
      costs: Object.fromEntries(Object.keys(NW.CARDS).map(id => [id, buyCost(state, seat == null ? 0 : seat, id)])),
    };
  }

  /* ---------------- 校验和（锁步联机检测不同步） ---------------- */
  function hash(state) {
    const s = JSON.stringify(state, (k, v) => (k === '_ev' || k === 'log' || k === 'meta') ? undefined : v);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  /** 由初始参数 + 动作序列复原对局（回放 / 断线重连）。 */
  function replay(opts, actions) {
    const st = createMatch(opts);
    for (const a of actions) { const r = apply(st, a); if (!r.ok) throw new Error('回放失败：' + r.error); }
    return st;
  }

  NW.engine = { guardValue, ENGINE_VERSION, DEFAULT_RULES, createMatch, apply, check, legalActions, view, hash, replay, clone, pendingOptions, buyCost, trashTargets, recallTargets };
  if (typeof module !== 'undefined' && module.exports) module.exports = NW;
})(typeof window !== 'undefined' ? window : globalThis);
