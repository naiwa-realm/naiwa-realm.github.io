/* 奶蛙领域 · 电脑对手
 * AI 只通过 engine.apply 能接受的动作行动，与人类玩家、联机玩家使用同一套接口。
 * 档位（profile）决定购买偏好、是否会算斩杀、是否会献祭等，PvE 关卡可自定义档位。
 */
(function (root) {
  'use strict';
  const NW = root.NW = root.NW || {};

  const PROFILES = {
    easy:   { label: '新手', think: 560, knapsack: false, lethal: false, scrap: false, statueAggro: 0.1, randomness: 4, minBuy: 0.5, buyChance: 0.55, useEnergy: 0.3, bias: {} },
    normal: { label: '标准', think: 440, knapsack: true,  lethal: true,  scrap: true,  statueAggro: 0.6, randomness: 0.6, minBuy: 0.8, bias: {} },
    hard:   { label: '大师', think: 380, knapsack: true,  lethal: true,  scrap: true,  statueAggro: 1.0, randomness: 0.15, minBuy: 1.0, synergy: 0.55,
              // 由 work/tune.js 自对弈爬山得到的购买偏好
              bias: { errand: 0.85, rich: 0.91, sleeper: 1.39, chieftain: 0.89, rocket: 1.44, scholar: 0.95, frenzy: 0.7, hold: 0.88, guard: 1.14, king: 0.97, cat: 0.75, angel: 1.36, sigma: 1.26, rooster: 0.71, goat: 0.9, pig: 1.6, dragon: 1.12, tiger: 0.82, monkey: 0.7, dog: 1.44, ox: 1.4, horse: 0.91, snake: 0.79, rabbit: 1.04, rat: 0.7 } },
  };

  const C = id => NW.CARDS[id];
  const idOf = (st, uid) => st.cards[uid];
  const allCards = p => p.deck.concat(p.hand, p.discard, p.played, p.statues.map(s => s.uid));

  function keepValue(id) {
    if (id === 'flower') return -1; if (id === 'baby') return 0; if (id === 'laugh') return 0.5; if (id === 'kungfu') return 0.6;
    const c = C(id); return 1 + c.cost * 0.5;
  }
  function statueValue(id) {
    const c = C(id); return c.cost * 0.8 + (c.taunt ? 1.5 : 0) + c.hp * 0.15;
  }

  function cardValue(st, seat, id, prof) {
    const c = C(id), p = st.seats[seat];
    let v = c.cost;
    const round = st.round;
    const produces = JSON.stringify(c.play || []) + JSON.stringify(c.turnStart || []);
    if (round <= 4 && produces.includes('coin')) v += 1.2;
    if (round >= 8 && produces.includes('power')) v += 1;
    if (round >= 9 && produces.includes('"coin"') && !produces.includes('power')) v -= 1;
    if (c.type === 'statue') v += round <= 6 ? 0.8 : -0.4;
    if (id === 'errand') v = round <= 5 ? 1.6 : 1.0;
    if (c.faction !== 'neutral') {
      const same = allCards(p).filter(u => C(idOf(st, u)).faction === c.faction).length;
      v += Math.min(same, 6) * (prof.synergy || 0.35);
    }
    v *= (prof.bias[c.faction] || 1) * (prof.bias[id] || 1);
    v += (Math.random() - 0.5) * prof.randomness;
    return v;
  }

  /* 选择 */
  function choosePending(st, seat, prof) {
    const pd = st.pending, opts = NW.engine.pendingOptions(st, pd);
    const p = st.seats[seat];
    const byKeep = (a, b) => keepValue(idOf(st, a)) - keepValue(idOf(st, b));
    if (pd.kind === 'discard') return { type: 'choose', seat, value: opts.slice().sort(byKeep)[0] };
    if (pd.kind === 'trash') {
      const inDiscard = opts.filter(u => p.discard.includes(u));
      const babies = opts.filter(u => idOf(st, u) === 'flower').concat(inDiscard.filter(u => idOf(st, u) === 'baby')).concat(opts.filter(u => idOf(st, u) === 'baby'));
      if (babies.length) return { type: 'choose', seat, value: babies[0] };
      const laughs = opts.filter(u => idOf(st, u) === 'laugh');
      if (laughs.length && st.round > 6) return { type: 'choose', seat, value: laughs[0] };
      return { type: 'choose', seat, value: 'skip' };
    }
    if (pd.kind === 'sigma') {
      const pick = opts.filter(u => p.deck.includes(u) && idOf(st, u) === 'baby')[0] || opts.filter(u => idOf(st, u) === 'baby')[0];
      return { type: 'choose', seat, value: pick || 'skip' };
    }
    if (pd.kind === 'marketTrash') { // 拿走对手最想要的牌
      const best = opts.map(u => ({ u, v: cardValue(st, 1 - seat, idOf(st, u), prof) })).sort((a, b) => b.v - a.v)[0];
      return { type: 'choose', seat, value: best && best.v >= 4 ? best.u : 'skip' };
    }
    if (pd.kind === 'destroyStatue') {
      const best = opts.slice().sort((a, b) => statueValue(idOf(st, b)) - statueValue(idOf(st, a)))[0];
      return { type: 'choose', seat, value: best || 'skip' };
    }
    return { type: 'choose', seat, value: opts[0] || 'skip' };
  }

  function knapsack(st, seat, prof) {
    const p = st.seats[seat];
    const items = [];
    st.market.forEach((uid, i) => { if (uid) items.push({ slot: i, id: idOf(st, uid) }); });
    for (const id of st.rules.permanent) for (let k = 0; k < 3; k++) items.push({ slot: 'p:' + id, id });
    for (const it of items) { it.cost = NW.engine.buyCost(st, seat, it.id); it.v = cardValue(st, seat, it.id, prof); }
    const useful = items.filter(it => it.v >= prof.minBuy);
    const W = p.coin;
    if (!prof.knapsack) { // 贪心：买得起的最高价值
      const can = useful.filter(it => it.cost <= W).sort((a, b) => b.v - a.v);
      return can.length ? can[0] : null;
    }
    // 0/1 背包
    const best = Array(W + 1).fill(null).map(() => ({ v: 0, pick: [] }));
    for (const it of useful) for (let w = W; w >= it.cost; w--) {
      const cand = best[w - it.cost].v + it.v;
      if (cand > best[w].v) best[w] = { v: cand, pick: best[w - it.cost].pick.concat(it) };
    }
    const pick = best[W].pick.sort((a, b) => b.cost - a.cost);
    return pick[0] || null;
  }

  function decide(st, seat, profName) {
    const prof = typeof profName === 'object' ? profName : (PROFILES[profName] || PROFILES.normal);
    const E = NW.engine;
    if (st.over) return null;
    if (st.pending) return st.pending.seat === seat ? choosePending(st, seat, prof) : null;
    if (st.active !== seat) return null;
    const p = st.seats[seat], o = st.seats[1 - seat];
    const ok = a => !E.check(st, a);
    const hand = p.hand.map(uid => ({ uid, id: idOf(st, uid), c: C(idOf(st, uid)) }));

    // 1) 雕塑（先放，提供阵营与“若有雕塑”条件）
    for (const h of hand.filter(h => h.c.type === 'statue')) {
      if (p.statues.length < st.rules.statueLimit) return { type: 'play', seat, uid: h.uid };
      const worst = p.statues.slice().sort((a, b) => statueValue(idOf(st, a.uid)) - statueValue(idOf(st, b.uid)))[0];
      if (statueValue(h.id) > statueValue(idOf(st, worst.uid)) + 0.5) return { type: 'play', seat, uid: h.uid, replace: worst.uid };
    }
    // 2) 状态牌
    const status = hand.find(h => h.c.type === 'status');
    if (status) return { type: 'play', seat, uid: status.uid };
    // 3) 角色：抽牌的先打
    const chars = hand.filter(h => h.c.type === 'char');
    if (chars.length) {
      chars.sort((a, b) => (JSON.stringify(b.c.play).includes('draw') ? 1 : 0) - (JSON.stringify(a.c.play).includes('draw') ? 1 : 0));
      return { type: 'play', seat, uid: chars[0].uid };
    }
    // 4) 奶劲抽牌
    if (ok({ type: 'drawExtra', seat }) && (prof.useEnergy == null || Math.random() < prof.useEnergy)) return { type: 'drawExtra', seat };

    // 4.5) 删牌机会：优先删弃牌堆 / 手牌里的起始牌，其次清掉市场里没用的便宜牌
    if (p.trashOps && p.trashOps.length) {
      const opts = E.trashTargets(st, seat, p.trashOps[0]);
      const pick = opts.filter(t => t.zone !== 'market' && idOf(st, t.uid) === 'flower')[0] || opts.filter(t => t.zone !== 'market' && idOf(st, t.uid) === 'baby').sort((a, b) => (a.zone === 'hand') - (b.zone === 'hand'))[0]
        || (st.round > 6 && opts.find(t => t.zone !== 'market' && idOf(st, t.uid) === 'laugh'))
        || opts.filter(t => t.zone === 'market').map(t => ({ t, v: cardValue(st, seat, idOf(st, t.uid), prof) })).filter(x => x.v < 2.5).sort((a, b) => a.v - b.v).map(x => x.t)[0];
      if (pick) return { type: 'useTrash', seat, op: 0, value: pick.uid };
    }
    // 5) 献祭
    if (prof.scrap) {
      const taunts = o.statues.filter(s => C(idOf(st, s.uid)).taunt);
      for (const uid of p.played) {
        const id = idOf(st, uid);
        if (id === 'king' && o.statues.length) {
          const tauntHp = taunts.reduce((s, x) => s + x.hp, 0);
          const blocked = taunts.length && p.power < tauntHp;
          const juicy = o.statues.some(s => statueValue(idOf(st, s.uid)) >= 5);
          const objBreak = st.objective && st.objective.type === 'breakStatues' && (st.objective.seat || 0) === seat;
          if (blocked || juicy || objBreak) return { type: 'scrap', seat, uid };
        }
        if (id === 'errand' && prof.lethal) {
          const tauntHp = taunts.reduce((s, x) => s + x.hp, 0);
          if (!E.guardValue(o, 'cap') && p.power + 2 >= o.hp + (p.pierce ? 0 : o.shield || 0) + tauntHp && p.power < o.hp + (p.pierce ? 0 : o.shield || 0) + tauntHp) return { type: 'scrap', seat, uid };
        }
      }
    }
    // 6) 购买
    const buy = (prof.buyChance == null || Math.random() < prof.buyChance) ? knapsack(st, seat, prof) : null;
    if (buy && ok({ type: 'buy', seat, slot: buy.slot })) return { type: 'buy', seat, slot: buy.slot };

    // 7) 攻击
    if (p.power > 0) {
      // 关卡目标：拆雕塑时，能拆就拆（先拆便宜的）
      const obj = st.objective || {};
      if (obj.type === 'breakStatues' && (obj.seat || 0) === seat) {
        const cheap = o.statues.filter(s => s.hp <= p.power).sort((a, b) => a.hp - b.hp)[0];
        if (cheap) return { type: 'attack', seat, target: cheap.uid };
      }
      // 对方有伤害上限（关卡「奶壳护体」/ 守势「神之藐视」）：超出上限的奶之力先拿去拆雕塑
      const oShield = p.pierce ? 0 : (o.shield || 0);
      const mcap = (st.mutators || []).find(m => m.id === 'heroShield' && m.seat === 1 - seat);
      const gcap = E.guardValue(o, 'cap');
      let max = Infinity;
      if (mcap) max = Math.min(max, (mcap.params && mcap.params.max) || 10);
      if (gcap) max = Math.min(max, oShield + Math.max(0, gcap - (o.lost || 0)));
      // 反伤：会把自己打死时不打本体
      const thorns = E.guardValue(o, 'thorns');
      const lethalNow = Math.min(p.power - oShield, max - oShield) >= o.hp;
      const suicide = thorns && thorns >= p.hp + (p.shield || 0) && !lethalNow;
      if (max < Infinity) {
        const spare = o.statues.filter(s => s.hp <= p.power - max).sort((a, b) => b.hp - a.hp)[0];
        if (spare && !o.statues.some(s => C(idOf(st, s.uid)).taunt && s !== spare)) return { type: 'attack', seat, target: spare.uid };
      }
      const taunts = o.statues.filter(s => C(idOf(st, s.uid)).taunt).sort((a, b) => b.hp - a.hp);
      if (taunts.length) {
        const fit = taunts.find(s => s.hp <= p.power);
        if (fit) return { type: 'attack', seat, target: fit.uid };
      } else {
        if (prof.lethal && lethalNow) return { type: 'attack', seat, target: 'hero' };
        if (suicide || max <= oShield) { const s3 = o.statues.filter(s => s.hp <= p.power).sort((a, b) => b.hp - a.hp)[0]; if (s3) return { type: 'attack', seat, target: s3.uid }; if (suicide) return { type: 'endTurn', seat }; }
        // 对方奶壳会吃掉大部分伤害时，优先拆雕塑
        if (oShield >= p.power) { const s2 = o.statues.filter(s => s.hp <= p.power).sort((a, b) => b.hp - a.hp)[0]; if (s2) return { type: 'attack', seat, target: s2.uid }; }
        const others = o.statues.filter(s => s.hp <= p.power).sort((a, b) => statueValue(idOf(st, b.uid)) - statueValue(idOf(st, a.uid)));
        for (const s of others) {
          const val = statueValue(idOf(st, s.uid));
          if (Math.random() < prof.statueAggro && (val >= 4 || p.power - s.hp >= 2)) return { type: 'attack', seat, target: s.uid };
        }
        // 憋笑：不能斩杀时把奶之力留到下回合（下回合还能破壳）
        if (p.status.includes('hold') && !lethalNow) return { type: 'endTurn', seat };
        return { type: 'attack', seat, target: 'hero' };
      }
    }
    return { type: 'endTurn', seat };
  }

  NW.AI = { PROFILES, decide, cardValue, statueValue, keepValue };
  if (typeof module !== 'undefined' && module.exports) module.exports = NW;
})(typeof window !== 'undefined' ? window : globalThis);
