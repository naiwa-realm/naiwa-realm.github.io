/* 奶蛙领域 · PvE：规则改造器（mutators）与远征关卡
 *
 * 一个关卡 = 对局参数（双方配置 + 规则覆盖 + mutators + 胜利条件）+ 叙事 + 星级评价。
 * 新增关卡只需在 LEVELS 里加一段数据；新增玩法机制在 MUTATORS 里加一个钩子对象。
 *
 * Mutator 钩子（全部可选）：
 *   setup(state, api, m)                    对局创建后
 *   turnStart(state, api, m, seat)          某方回合开始（已抽牌、雕塑已结算）
 *   turnEnd(state, api, m, seat)
 *   roundEnd(state, api, m, round)
 *   afterPlay(state, api, m, seat, uid) / afterBuy(...) / afterAction(state, api, m, action)
 *   modifyDamage(state, api, m, seat, n, src) → 返回新伤害值
 *   statueHp(state, m, seat, uid, hp) → 返回新耐久
 *   cost(state, m, seat, cardId, cost) → 返回新价格
 * m 是 state.mutators 中的条目 {id, seat, params, ...}，可在其上记录跨回合数据（会随状态一起存档/同步）。
 */
(function (root) {
  'use strict';
  const NW = root.NW = root.NW || {};
  const P = (m, k, d) => (m.params && m.params[k] != null ? m.params[k] : d);

  const MUTATORS = {
    bonusRes: {
      name: m => P(m, 'name', '额外资源'),
      desc: m => `${P(m, 'every', 1) > 1 ? `每 ${P(m, 'every', 1)} 回合` : '每回合'}开始时，${m.seat === 1 ? '敌方' : '你'}获得 ${P(m, 'n', 1)}${{ coin: '奶蛋', power: '奶之力', energy: '奶劲' }[P(m, 'res', 'power')]}`,
      turnStart(st, api, m, seat) { if (seat === m.seat && st.round % P(m, 'every', 1) === 0) api.gain(seat, P(m, 'res', 'power'), P(m, 'n', 1)); },
    },
    fortress: {
      name: m => P(m, 'n', 2) < 0 ? '风化' : '要塞', desc: m => `${m.seat === 1 ? '敌方' : '你的'}雕塑耐久 ${P(m, 'n', 2) < 0 ? '' : '+'}${P(m, 'n', 2)}`,
      statueHp(st, m, seat, uid, hp) { return seat === m.seat ? hp + P(m, 'n', 2) : hp; },
    },
    marketChurn: {
      name: () => '灵雾', desc: () => '每回合开始，市场最右侧的牌被迷雾卷走并替换',
      turnStart(st, api, m, seat) { if (seat === st.first) api.replaceMarket(st.market.length - 1); },
    },
    regen: {
      name: () => '再生', desc: m => `${m.seat === 1 ? '敌方' : '你'}每回合开始恢复 ${P(m, 'n', 1)} 生命`,
      turnStart(st, api, m, seat) { if (seat === m.seat) api.heal(seat, P(m, 'n', 1)); },
    },
    royalDecree: {
      name: () => '王令', desc: m => `每第 ${P(m, 'every', 3)} 回合，敌方回合开始时获得 ${P(m, 'n', 5)} 奶之力`,
      turnStart(st, api, m, seat) {
        if (seat === m.seat && st.round % P(m, 'every', 3) === 0) { api.banner('王令降临', `${st.seats[seat].name} 获得 ${P(m, 'n', 5)} 奶之力`); api.gain(seat, 'power', P(m, 'n', 5)); }
      },
    },
    heroShield: {
      name: () => '奶壳护体', desc: m => `${m.seat === 1 ? '敌方' : '你'}单次受到的伤害最多 ${P(m, 'max', 10)} 点`,
      modifyDamage(st, api, m, seat, n) { return seat === m.seat ? Math.min(n, P(m, 'max', 10)) : n; },
    },
    phaseShift: {
      name: () => '暗影觉醒', desc: m => `敌方生命首次降到 ${P(m, 'at', 25)} 以下时进入第二阶段：唤醒${NW.CARDS[P(m, 'statue', 'dragon')].name}，之后每回合 +${P(m, 'n', 2)} 奶之力`,
      afterAction(st, api, m) {
        const s = st.seats[m.seat];
        if (!m.fired && !st.over && s.hp <= P(m, 'at', 25)) {
          m.fired = true; api.banner('暗影觉醒', `${s.name} 进入第二阶段`); api.heal(m.seat, P(m, 'heal', 5));
          if (s.statues.length < st.rules.statueLimit) api.addStatue(m.seat, P(m, 'statue', 'dragon'));
          api.log(m.seat, `${s.name} 进入第二阶段！`);
        }
      },
      turnStart(st, api, m, seat) { if (m.fired && seat === m.seat) api.gain(seat, 'power', P(m, 'n', 2)); },
    },
    discount: {
      name: () => '老乡优惠', desc: m => `你购买${NW.FACTIONS[P(m, 'faction', 'egg')].name}的牌便宜 ${P(m, 'n', 1)} 奶蛋`,
      cost(st, m, seat, id, cost) { return seat === m.seat && NW.CARDS[id].faction === P(m, 'faction', 'egg') ? cost - P(m, 'n', 1) : cost; },
    },
    shellUp: {
      name: () => '硬壳', desc: m => `${m.seat === 1 ? '敌方' : '你'}每回合开始获得 ${P(m, 'n', 3)} 奶壳（破壳可以无视）`,
      turnStart(st, api, m, seat) { if (seat === m.seat) api.shield(seat, P(m, 'n', 3)); },
    },
    flowers: {
      name: () => '送花', desc: m => `每 ${P(m, 'every', 2)} 回合，耄耋特派员往你的弃牌堆塞 ${P(m, 'n', 1)} 束「耄耋的花」（没有任何作用的杂物牌）`,
      turnStart(st, api, m, seat) {
        if (seat === m.seat && st.round % P(m, 'every', 2) === 0) { const v = 1 - m.seat; for (let i = 0; i < P(m, 'n', 1); i++) api.addToDiscard(v, 'flower'); api.log(m.seat, `${st.seats[m.seat].name} 送来了 ${P(m, 'n', 1)} 束耄耋的花`); }
      },
    },
    tax: {
      name: () => '外交关税', desc: m => `你招募任何牌都要多付 ${P(m, 'n', 1)} 奶蛋`,
      cost(st, m, seat, id, cost) { return seat !== m.seat ? cost + P(m, 'n', 1) : cost; },
    },
    gift: {
      name: () => '补给', desc: m => `开局时${m.seat === 1 ? '敌方' : '你'}的弃牌堆中加入：${P(m, 'cards', []).map(id => NW.CARDS[id].name).join('、')}`,
      setup(st, api, m) { for (const id of P(m, 'cards', [])) api.addToDiscard(m.seat, id); },
    },
  };

  /* ---------------- 远征关卡 ---------------- */
  const pool = (base, extra) => (NW.DEFAULT_POOL || []).concat(...Object.entries(extra).map(([id, n]) => Array(n).fill(id)));

  const CHAPTERS = [
    { id: 1, name: '奶蛋平原', desc: '新手教学：前三关有教官一步步带你操作。' },
    { id: 2, name: '迷雾奶林', desc: '林子里的奶蛙，各有各的门道。' },
    { id: 3, name: '奶国王座', desc: '王座上坐着的，是谁的影子？' },
    { id: 4, act: 2, name: '奶国之战', desc: '耄耋军团入侵奶家军。为了守护哈家正统，迎战！' },
  ];

  /* 两部远征。第二部在打败暗影国王（3-2）后解锁，关卡摆在博古架上 */
  const ACTS = [
    { id: 1, name: '奶国远征', sub: '第一部', chapters: [1, 2, 3],
      // 地图（原图 1448×1086）上 9 个编号圆盘的中心
      map: { '1-1': [222, 784], '1-2': [326, 650], '1-3': [270, 448], '1-4': [344, 252], '2-1': [646, 424], '2-2': [824, 268], '2-3': [1040, 474], '3-1': [1188, 814], '3-2': [1272, 184] } },
    { id: 2, name: '奶国之战', sub: '第二部', chapters: [4], unlockAfter: '3-2',
      prologue: [
        { who: '铁甲奶蛙', art: 'guard', text: '报——！暗影国王刚倒下，边境就出事了！' },
        { who: '铁甲奶蛙', art: 'guard', text: '耄耋军团越过奶门，入侵奶家军的营地！它们戴着头盔，横着走，还给我们送花……' },
        { who: '哈家军', art: 'army', text: '哈？哈家正统，岂容猫辈染指！' },
        { who: '教官奶蛙', art: 'coach', text: '指挥官，整顿牌组。奶国之战，开始了。这一部的星星，要靠你完成指定的操作才能拿到。' },
      ],
      epilogue: [
        { who: '耄耋耄耋', art: 'md_maodie', text: '耄……耋……（像素化地倒下了）' },
        { who: '铁甲奶蛙', art: 'guard', text: '耄耋军团撤退了！奶家军的营地守住了！' },
        { who: '哈家军', art: 'army', text: '哈哈哈哈哈！哈家正统，万世不移！' },
        { who: '教官奶蛙', art: 'coach', text: '干得好，指挥官。博古架上的每一件摆件，都是你打下来的。' },
      ],
      // 博古架摆位（博古架原图 1448×1086 像素坐标）：x 中心、floor 隔板高度、h 可用高度、w 可用宽度
      shelf: {
        W1: { x: 840, floor: 628, h: 92, w: 230 }, W2: { x: 780, floor: 503, h: 68, w: 160 }, W3: { x: 945, floor: 503, h: 88, w: 100 },
        W4: { x: 556, floor: 543, h: 104, w: 220 }, W5: { x: 925, floor: 408, h: 108, w: 190 }, W6: { x: 632, floor: 408, h: 110, w: 280 },
        W7: { x: 720, floor: 268, h: 96, w: 260 }, W8: { x: 729, floor: 104, h: 118, w: 200 },
      } },
  ];

  const LEVELS = [
    /* ---------- 第一章：新手教学（tutorial = 教官奶蛙的分步引导，只在界面层使用） ---------- */
    { id: '1-1', chapter: 1, title: '初到奶国', subtitle: '教学 · 出牌、购买、攻击',
      story: [{ who: '教官奶蛙', art: 'coach', text: '欢迎来到奶国！对面的稻草奶娃不会还手。跟着我一步一步来。' }],
      tip: '跟着教官的提示操作：打出手牌 → 购买 → 攻击 → 结束回合。',
      enemy: { name: '稻草奶娃', portrait: 'baby', hp: 8, deck: { baby: 10 }, ai: { base: 'easy', buyChance: 0, useEnergy: 0 } },
      player: { fixedOrder: true, deck: ['baby', 'baby', 'baby', 'laugh', 'kungfu', 'baby', 'baby', 'baby', 'laugh', 'baby'] },
      rules: { fixedMarket: ['rocket', 'rich', 'cat', 'sleeper', 'scholar'] },
      objective: { type: 'defeat' },
      stars: [{ type: 'win', label: '获胜' }, { type: 'bought', n: 3, label: '招募至少 3 张牌' }, { type: 'extraDraws', n: 1, label: '用奶劲多抽 1 次牌' }],
      tutorial: [
        { text: '欢迎来到奶国！我是教官奶蛙。这一关我们一步一步学会基本操作。对面的稻草奶娃不会还手，放心练习。', next: true },
        { target: '#hand', text: '这是你的手牌，每回合开始抽 5 张。卡牌下半部分写着它的效果。', next: true },
        { target: '#hand .card[data-id="baby"]', text: '点击一张「普通奶娃」把它打出（也可以按住拖到牌桌中央）。它会给你 1 枚奶蛋。', done: c => c.ev('play', e => c.id(e.uid) === 'baby') },
        { target: '#orb-coin', text: '奶蛋变成了 1。奶蛋用来在市场购买新牌，只在本回合有效，回合结束就清空。', next: true },
        { target: '#btnAll', text: '一张一张点太慢了。点「全部打出」（或按空格），把剩下的手牌都打出去。', done: c => !(c.me.hand || []).length },
        { target: '#deck-me', text: '功夫奶蛙给了你 1 点奶劲（青色）。点击你的牌库（或奶劲按钮），消耗 1 奶劲多抽 1 张牌。', done: c => c.ev('spend', e => e.res === 'energy') },
        { target: '#hand', text: '抽到了一张新牌，把它也打出去。', done: c => !(c.me.hand || []).length },
        { target: '#market', text: '你现在有 4 枚奶蛋。市场里每张牌左上角的数字是价格。点击一张买得起的牌购买，推荐 2 奶蛋的「火箭奶蛙」，它能给 2 点奶之力。买到的牌先进入你的弃牌堆。', done: c => c.ev('buy') },
        { target: '#hero-op', text: '你还有奶之力（红色）。按住下方的奶之力拖到对手头像上，或者直接点击对手头像，就能攻击。', done: c => c.ev('attack') },
        { target: '#btnEnd', text: '这回合能做的都做完了。点「结束回合」（或按 E）。如果按钮提示还有资源没用，再点一次确认。', done: c => c.ev('cleanup', e => e.seat === c.seat) },
        { text: '新的回合开始，你又抽了 5 张。基本循环就是：打出手牌 → 购买 → 攻击 → 结束回合。', next: true },
        { target: '#discard-me', text: '你买的牌在弃牌堆里。牌库抽完时，弃牌堆会洗回去成为新牌库，那时就能抽到新买的牌了。', next: true },
        { text: '现在你自己来，把稻草奶娃打倒吧！鼠标停在任意卡牌上可以看大图，右键可以看详细说明。', next: true },
      ] },
    { id: '1-2', chapter: 1, title: '同心协力', subtitle: '教学 · 阵营与联动',
      story: [{ who: '绷不住团学徒', art: 'rocket', text: '我们绷不住团讲究一个配合！一个人笑不够响，两个人一起笑才够劲！' }],
      tip: '同阵营的牌一起打出会触发「联动」。买牌时集中在一两个阵营。',
      enemy: { name: '绷不住团学徒', portrait: 'laugh', hp: 16, deck: { baby: 7, laugh: 3 }, ai: { base: 'easy', buyChance: 0.5 } },
      player: { fixedOrder: true, deck: ['rocket', 'rocket', 'baby', 'baby', 'laugh', 'baby', 'baby', 'baby', 'baby', 'baby', 'laugh', 'kungfu'] },
      rules: { fixedMarket: ['rocket', 'scholar', 'frenzy', 'rich', 'cat'], pool: pool(null, { rocket: 3, scholar: 2, frenzy: 1 }) },
      objective: { type: 'defeat' },
      stars: [{ type: 'win', label: '获胜' }, { type: 'allies', n: 4, label: '触发至少 4 次联动' }, { type: 'rounds', max: 10, label: '10 回合内获胜' }],
      tutorial: [
        { target: '#hand .card[data-id="rocket"] .c-fac', text: '这一关学「阵营」和「联动」。卡牌右上角的字是它的阵营：躺 = 躺平派，绷 = 绷不住团，硬 = 嘴硬帮，西 = 西格玛会。', next: true },
        { target: '#hand .card[data-id="rocket"] .ab.ally', text: '卡牌上标着「联动」的效果，会在本回合你已经打出过另一张同阵营的牌（或者你场上有同阵营的雕塑）时自动触发。', next: true },
        { target: '#hand .card[data-id="rocket"]', text: '先打出一张「火箭奶蛙」。', done: c => c.ev('play', e => c.id(e.uid) === 'rocket') },
        { target: '#hand .card[data-id="rocket"]', text: '另一张火箭奶蛙上亮起了「联动就绪」。打出它，两张会互相触发联动！', done: c => c.ev('ally') },
        { target: '#orb-power', text: '两张火箭各多给了 2 点奶之力，一共 8 点。同阵营的牌越多，联动就越频繁。', next: true },
        { target: '#market', text: '所以买牌时尽量集中在一两个阵营。鼠标停在市场卡牌上，会提示你已经有几张同阵营的牌。', next: true },
        { text: '打出剩下的牌，买牌、攻击、结束回合。这一关的星级要求是多触发联动。', next: true },
      ] },
    { id: '1-3', chapter: 1, title: '嘲讽的石像', subtitle: '教学 · 雕塑与嘲讽',
      story: [{ who: '石像看守', art: 'dog', text: '想打我主人？先过奶狗这一关。汪。' }],
      tip: '嘲讽雕塑在场时不能攻击本体，先一次付出等于耐久的奶之力把它击碎。你自己的雕塑会每回合帮你。',
      enemy: { name: '石像看守', portrait: 'dog', hp: 18, statues: ['dog'], ai: { base: 'easy', bias: { dog: 2, ox: 2, horse: 1.5 } } },
      player: { fixedOrder: true, deck: ['goat', 'rocket', 'laugh', 'laugh', 'baby', 'baby', 'baby', 'baby', 'baby', 'baby', 'baby', 'kungfu'] },
      rules: { fixedMarket: ['rocket', 'goat', 'rich', 'rat', 'scholar'] },
      mutators: [{ id: 'fortress', seat: 1, params: { n: -2 } }],
      objective: { type: 'defeat' },
      stars: [{ type: 'win', label: '获胜' }, { type: 'broke', n: 2, label: '击碎至少 2 座雕塑' }, { type: 'statuesPlayed', n: 2, label: '唤醒至少 2 座自己的雕塑' }],
      tutorial: [
        { target: '#statues-op .card', text: '对手场上有一座雕塑「奶狗」。雕塑会一直留在场上，每回合给主人好处；盾牌里的数字是它的耐久（本关石像风化，耐久 -2）。', next: true },
        { target: '#hero-op', text: '奶狗带「嘲讽」：只要它在场，你就不能攻击对手本体，必须先击碎它。', next: true },
        { target: '#hand .card[data-id="goat"]', text: '你也有一座雕塑「奶羊」。打出它，它会留在你这边，从你下回合开始每回合给你 1 奶蛋；它还带嘲讽，对手要先拆掉它才能打你。', done: c => c.ev('play', e => e.to === 'statue') },
        { target: '#statues-me', text: '奶壳会挡住对手打到你本体的伤害，挡到你下回合开始为止。你最多能同时拥有 3 座雕塑。', next: true },
        { target: '#btnAll', text: '把剩下的牌都打出去。', done: c => !(c.me.hand || []).length },
        { target: '#statues-op .card', text: '你有 4 点奶之力，正好等于奶狗的耐久。把奶之力拖到奶狗身上（或直接点击它）击碎它。击碎雕塑必须一次付出等于耐久的奶之力。', done: c => c.ev('statueBroken', e => e.by === c.seat) },
        { target: '#hero-op', text: '嘲讽解除了！以后有剩余的奶之力就可以打对手本体。小心，对手还会造新的雕塑。', next: true },
        { text: '自己来吧：拆掉碍事的雕塑，也给自己造几座。这一关的星级要求就是这两件事。', next: true },
      ] },
    { id: '1-4', chapter: 1, title: '笑声风暴', subtitle: '第一章考核',
      story: [{ who: '绷不住团长', art: 'laugh', text: '哈哈哈哈哈！我们绷不住团的牌，一张接一张，越笑越猛！' }],
      tip: '第一章的考核：用上学过的一切。挑一个主阵营多触发联动，有嘲讽雕塑先拆掉。绷不住团长每 3 回合会额外获得 2 奶之力。',
      enemy: { name: '绷不住团长', portrait: 'laugh', hp: 22, ai: { base: 'easy', randomness: 1.2, buyChance: 0.8, useEnergy: 0.7, bias: { rocket: 1.8, scholar: 1.5, frenzy: 1.8, hold: 1.4, dragon: 1.5, tiger: 1.5 } } },
      rules: { pool: pool(null, { rocket: 2, scholar: 1, frenzy: 1 }) },
      mutators: [{ id: 'bonusRes', seat: 1, params: { res: 'power', n: 2, every: 3, name: '笑场' } }],
      objective: { type: 'defeat' },
      stars: [{ type: 'win', label: '获胜' }, { type: 'allies', n: 4, label: '触发至少 4 次联动' }, { type: 'hp', min: 10, label: '剩余生命 ≥ 10' }] },

    { id: '2-1', chapter: 2, title: '灵雾秘仪', subtitle: '市场流转',
      story: [{ who: '西格玛导师', art: 'cat', text: '雾会带走你犹豫的那张牌。喵。' }],
      tip: '「灵雾」每回合会换掉市场最右侧的牌，看中了就早点买。用奶蛋守护者、奶门的世界和西格奶精简牌库。',
      enemy: { name: '西格玛导师', portrait: 'cat', hp: 26, extraCards: ['angel'], ai: { base: 'easy', randomness: 1.2, buyChance: 0.85, useEnergy: 0.8, bias: { angel: 1.8, sigma: 1.8, cat: 1.6, rabbit: 1.6, snake: 1.5, rat: 1.4 } } },
      mutators: [{ id: 'marketChurn', seat: null }, { id: 'regen', seat: 1, params: { n: 1 } }],
      objective: { type: 'defeat' },
      stars: [{ type: 'win', label: '获胜' }, { type: 'trashed', n: 2, label: '删除至少 2 张牌' }, { type: 'rounds', max: 14, label: '14 回合内获胜' }] },
    { id: '2-2', chapter: 2, title: '嘴硬要塞', subtitle: '特殊目标 · 拆除',
      story: [{ who: '嘴硬将军', art: 'guard', text: '要塞的每一座石像都是我亲手堆的。你拆一座，我就再堆一座！' }],
      tip: '本关目标：累计击碎 3 座敌方雕塑，不需要打败将军本人。嘴硬帮的曾经的王可以献祭直接击碎一座。',
      enemy: { name: '嘴硬将军', portrait: 'guard', hp: 34, statues: ['ox', 'dog'], ai: { base: 'easy', randomness: 1.5, buyChance: 0.85, useEnergy: 0.7, bias: { dog: 2.2, ox: 2.2, horse: 1.8, guard: 1.6, king: 1.5, rooster: 1.3, goat: 1.3 } } },
      objective: { type: 'breakStatues', n: 3, seat: 0 },
      stars: [{ type: 'win', label: '完成目标' }, { type: 'rounds', max: 10, label: '10 回合内完成' }, { type: 'hp', min: 9, label: '剩余生命 ≥ 9' }] },
    { id: '2-3', chapter: 2, title: '守住奶蛋仓', subtitle: '特殊目标 · 生存',
      story: [{ who: '饥饿奶猪群', art: 'pig', text: '哼哧哼哧……闻到奶蛋的味道了……' }],
      tip: '本关目标：撑过 10 回合。奶猪群每回合额外获得 1 奶之力。躺平派的奶壳（本关躺平派牌便宜 1 奶蛋）和嘴硬帮的嘲讽雕塑会很有用。',
      enemy: { name: '饥饿奶猪群', portrait: 'pig', hp: 70, ai: { base: 'hard', bias: { rocket: 2, guard: 1.6, dragon: 1.6 } } },
      player: { extraCards: [] },
      mutators: [{ id: 'bonusRes', seat: 1, params: { res: 'power', n: 1, every: 1, name: '饥饿' } }, { id: 'discount', seat: 0, params: { faction: 'egg', n: 1 } }],
      objective: { type: 'survive', rounds: 10, seat: 0 },
      stars: [{ type: 'win', label: '撑过 10 回合' }, { type: 'hp', min: 12, label: '剩余生命 ≥ 12' }, { type: 'dealt', n: 14, label: '对奶猪群造成 14 点伤害' }] },

    { id: '3-1', chapter: 3, title: '曾经的王', subtitle: 'BOSS',
      story: [{ who: '曾经的王', art: 'king', text: '这背心……是王的背心。这王座……也还是王的王座。' }],
      tip: '「王令」每 3 回合让他获得 3 奶之力；「奶壳护体」让单次伤害最多 10 点，攻击本体会用掉全部奶之力，所以超过 10 的部分先拿去拆他的雕塑。',
      enemy: { name: '曾经的王', portrait: 'king', hp: 30, ai: { base: 'normal', bias: { king: 1.6, guard: 1.5, dog: 1.4, ox: 1.4 } } },
      mutators: [{ id: 'royalDecree', seat: 1, params: { every: 3, n: 3 } }, { id: 'heroShield', seat: 1, params: { max: 10 } }],
      objective: { type: 'defeat' },
      stars: [{ type: 'win', label: '获胜' }, { type: 'rounds', max: 13, label: '13 回合内获胜' }, { type: 'hp', min: 10, label: '剩余生命 ≥ 10' }] },
    { id: '3-2', chapter: 3, title: '暗影国王', subtitle: '第一部最终 BOSS',
      story: [{ who: '暗影国王', art: 'shadowking', text: '哈哈哈哈哈！我就是你没打出去的那些牌！' }],
      tip: '两阶段 BOSS：每回合额外获得 1 奶之力，生命降到 20 以下会唤醒奶龙、回复 5 生命并每回合再 +3 奶之力。第二阶段前先把牌库练好，留好嘲讽雕塑或奶壳。',
      enemy: { name: '暗影国王', portrait: 'shadowking', hp: 40, ai: { base: 'normal', randomness: 0.4, synergy: 0.5 } },
      mutators: [{ id: 'phaseShift', seat: 1, params: { at: 20, statue: 'dragon', n: 3, heal: 5 } }, { id: 'bonusRes', seat: 1, params: { res: 'power', n: 1, every: 1, name: '暗影' } }, { id: 'regen', seat: 1, params: { n: 1 } }],
      objective: { type: 'defeat' },
      stars: [{ type: 'win', label: '获胜' }, { type: 'rounds', max: 17, label: '17 回合内获胜' }, { type: 'hp', min: 10, label: '剩余生命 ≥ 10' }] },

    /* ---------- 第二部 · 奶国之战（星级主要靠完成指定操作） ---------- */
    { id: 'W1', chapter: 4, title: '边境哨所', subtitle: '耄耋老兵 · 嘲讽阵地',
      story: [{ who: '铁甲奶蛙', art: 'guard', text: '前面就是边境哨所。耄耋老兵守在那儿，戴着头盔，一动不动。' }, { who: '耄耋老兵', art: 'md_vet', text: '……喵？（头盔下的眼睛瞪得溜圆）' }],
      tip: '老兵喜欢造嘲讽雕塑（奶狗、奶牛），拆掉它们才能打到本体。多拆雕塑；想一回合打出 7 张牌，用奶劲多抽两张就行。',
      enemy: { name: '耄耋老兵', portrait: 'md_vet', hp: 22, ai: { base: 'easy', randomness: 1.0, buyChance: 0.9, useEnergy: 0.7, bias: { dog: 2, ox: 2, guard: 1.6, nolaugh: 1.5, horse: 1.4 } } },
      objective: { type: 'defeat' },
      stars: [{ type: 'win', label: '获胜' }, { type: 'broke', n: 2, label: '击碎 2 座雕塑' }, { type: 'turnPlays', n: 7, label: '一回合内打出 7 张牌' }] },
    { id: 'W2', chapter: 4, title: '横行的钳子', subtitle: '耄耋蟹 · 硬壳',
      story: [{ who: '耄耋蟹', art: 'md_crab', text: '（横着走过来，钳子一张一合）' }, { who: '哈家军', art: 'army', text: '它的壳太硬了！用破壳，或者憋一口大的！' }],
      tip: '耄耋蟹每回合开始获得 3 奶壳。哈家军联动和憋笑都能让攻击无视奶壳；憋笑还能把奶之力攒成一次大的。',
      enemy: { name: '耄耋蟹', portrait: 'md_crab', hp: 30, ai: { base: 'normal', bias: { nolaugh: 2.2, goat: 1.8, sleeper: 1.5, dog: 1.4 } } },
      rules: { pool: pool(null, { army: 1, hold: 1, frenzy: 1 }) },
      mutators: [{ id: 'shellUp', seat: 1, params: { n: 3 } }],
      objective: { type: 'defeat' },
      stars: [{ type: 'win', label: '获胜' }, { type: 'bigHit', n: 11, label: '单次攻击打掉 11 点生命' }, { type: 'statusPlayed', n: 12, label: '累计打出 12 张状态牌' }] },
    { id: 'W3', chapter: 4, title: '特派员来访', subtitle: '耄耋特派员 · 送花',
      story: [{ who: '耄耋特派员', art: 'md_envoy', text: '我代表耄耋军团，来给各位送花。（花里好像有猫毛）' }, { who: '教官奶蛙', art: 'coach', text: '花没有任何作用，只会把你的牌组撑胖。用删牌机会把它们清掉。' }],
      tip: '开局你的弃牌堆里有 1 束花，之后每 2 回合再塞 1 束。奶门的世界、奶蛋守护者、西格奶都能帮你删牌；本关市场里删牌牌更多。',
      enemy: { name: '耄耋特派员', portrait: 'md_envoy', hp: 22, ai: { base: 'easy', randomness: 1.0, buyChance: 0.9, useEnergy: 0.7, bias: { rich: 1.6, sleeper: 1.6, goat: 1.4 } } },
      rules: { pool: pool(null, { gate: 2, rich: 1, sigma: 1 }) },
      mutators: [{ id: 'gift', seat: 0, params: { cards: ['flower'] } }, { id: 'flowers', seat: 1, params: { every: 2, n: 1 } }],
      objective: { type: 'defeat' },
      stars: [{ type: 'win', label: '获胜' }, { type: 'trashedId', id: 'flower', n: 5, label: '删掉 5 束耄耋的花' }, { type: 'trashed', n: 9, label: '累计删牌 9 张' }] },
    { id: 'W4', chapter: 4, title: '橙色风暴', subtitle: '橙耄 · 橙汁续命',
      story: [{ who: '橙耄', art: 'md_orange', text: '（从橙子里探出头）维生素 C，喵。' }, { who: '铁甲奶蛙', art: 'guard', text: '它每回合都在回血，还越打越有钱。得一口气打穿它！' }],
      tip: '橙耄每回合恢复 2 生命并多拿 1 奶蛋。奶劲是更好的抽牌：多攒奶劲、一回合连抽带打，伤害比它回血快。',
      enemy: { name: '橙耄', portrait: 'md_orange', hp: 28, ai: { base: 'normal', bias: { chieftain: 1.6, pig: 1.6, rooster: 1.5, king: 1.4 } } },
      mutators: [{ id: 'regen', seat: 1, params: { n: 2 } }, { id: 'bonusRes', seat: 1, params: { res: 'coin', n: 1, every: 1, name: '橙汁' } }],
      objective: { type: 'defeat' },
      stars: [{ type: 'win', label: '获胜' }, { type: 'extraDraws', n: 15, label: '累计用奶劲多抽 15 次' }, { type: 'turnPlays', n: 9, label: '一回合内打出 9 张牌' }] },
    { id: 'W5', chapter: 4, title: '老兵不死', subtitle: '耄耋老兵 · 冲锋号',
      story: [{ who: '耄耋老兵', art: 'md_vet', text: '（头盔擦得锃亮）喵——！（吹响了冲锋号）' }, { who: '教官奶蛙', art: 'coach', text: '它守得更死了。趁这一仗，把起始的普通奶娃和大笑奶蛙全部删掉，牌组才算练成。' }],
      tip: '老兵开局摆了 3 个训练假人（耐久 3 的嘲讽雕塑），每 3 回合冲锋一次（+5 奶之力）。三星要求删光 7 张普通奶娃和 2 张大笑奶蛙：精英招募、奶蛋守护者、西格奶、奶门的世界都能给删牌机会。',
      enemy: { name: '耄耋老兵', portrait: 'md_vet', hp: 20, statues: ['dummy', 'dummy', 'dummy'], ai: { base: 'easy', randomness: 0.8, buyChance: 0.9, useEnergy: 0.8, bias: { dog: 2, ox: 2, guard: 1.6, king: 1.5, horse: 1.4 } } },
      rules: { pool: pool(null, { gate: 2, rich: 2, angel: 1, sigma: 1 }) },
      mutators: [{ id: 'royalDecree', seat: 1, params: { every: 3, n: 5 } }],
      objective: { type: 'defeat' },
      stars: [{ type: 'win', label: '获胜' }, { type: 'purge', ids: ['baby', 'laugh'], label: '删光初始的普通奶娃和大笑奶蛙' }, { type: 'broke', n: 5, label: '击碎 5 座雕塑' }] },
    { id: 'W6', chapter: 4, title: '外交危机', subtitle: '耄耋特派员 · 关税',
      story: [{ who: '耄耋特派员', art: 'md_envoy', text: '根据新条约，你们买东西要交关税。另外，又送来一些花。' }, { who: '哈家军', art: 'army', text: '买得少，就要买得精！' }],
      tip: '本关招募每张牌都要多付 1 奶蛋，特派员每 3 回合塞 1 束花。少买精买，把花全部删掉。',
      enemy: { name: '耄耋特派员', portrait: 'md_envoy', hp: 24, ai: { base: 'easy', randomness: 0.8, buyChance: 0.9, useEnergy: 0.8, bias: { rich: 1.6, sleeper: 1.6, chieftain: 1.5, goat: 1.4 } } },
      rules: { pool: pool(null, { gate: 2, sigma: 1 }) },
      mutators: [{ id: 'tax', seat: 1, params: { n: 1 } }, { id: 'flowers', seat: 1, params: { every: 3, n: 1 } }],
      objective: { type: 'defeat' },
      stars: [{ type: 'win', label: '获胜' }, { type: 'purge', ids: ['flower'], label: '获胜时牌组里没有耄耋的花' }, { type: 'boughtMax', n: 11, label: '整局招募不超过 11 张牌' }] },
    { id: 'W7', chapter: 4, title: '橙耄军团', subtitle: '橙耄 · 橙皮护甲',
      story: [{ who: '橙耄', art: 'md_orange', text: '这次我叫来了整箱的橙子。' }, { who: '铁甲奶蛙', art: 'guard', text: '它的橙皮挡得住大伤害，那就打出更多的牌，一次一次磨！' }],
      tip: '橙耄单次最多受到 9 点伤害，每回合恢复 2 生命、额外获得 1 奶之力。多攻击几次：打出一部分牌就先打一下本体，再出牌再打。',
      enemy: { name: '橙耄', portrait: 'md_orange', hp: 34, ai: { base: 'normal', bias: { chieftain: 1.6, pig: 1.5, dragon: 1.5, tiger: 1.4 } } },
      mutators: [{ id: 'heroShield', seat: 1, params: { max: 9 } }, { id: 'regen', seat: 1, params: { n: 2 } }, { id: 'bonusRes', seat: 1, params: { res: 'power', n: 1, every: 1, name: '橙皮' } }],
      objective: { type: 'defeat' },
      stars: [{ type: 'win', label: '获胜' }, { type: 'heroHits', n: 2, label: '一回合内攻击本体 2 次' }, { type: 'broke', n: 3, label: '击碎 3 座雕塑' }] },
    { id: 'W8', chapter: 4, title: '耄耋耄耋', subtitle: '第二部最终 BOSS',
      story: [{ who: '耄耋耄耋', art: 'md_maodie', text: '耄耋。耄耋耄耋。耄——耋——！' }, { who: '教官奶蛙', art: 'coach', text: '耄耋军团的首领。它会硬壳、会送花，残血时还会召来奶虎。把起始牌删得一张不剩，才配得上这一战。' }],
      tip: '两阶段 BOSS：每回合 +1 奶之力和 2 奶壳，每 3 回合送 1 束花；生命降到 18 以下回复 6 生命、唤醒奶虎，之后每回合再 +2 奶之力。',
      enemy: { name: '耄耋耄耋', portrait: 'md_maodie', hp: 30, ai: { base: 'normal', randomness: 0.7, synergy: 0.4 } },
      rules: { pool: pool(null, { gate: 2, army: 1, rich: 1, sigma: 1 }) },
      mutators: [{ id: 'phaseShift', seat: 1, params: { at: 18, statue: 'tiger', n: 2, heal: 6 } }, { id: 'shellUp', seat: 1, params: { n: 2 } }, { id: 'flowers', seat: 1, params: { every: 3, n: 1 } }, { id: 'bonusRes', seat: 1, params: { res: 'power', n: 1, every: 1, name: '耄耋之力' } }],
      objective: { type: 'defeat' },
      stars: [{ type: 'win', label: '获胜' }, { type: 'purge', ids: ['baby', 'laugh', 'kungfu'], label: '删光全部起始牌' }, { type: 'bigHit', n: 14, label: '单次攻击打掉 14 点生命' }] },
  ];

  /* v8.5 难度下调：v8.4.1 重新训练 AI 后，以「标准」AI 代打为玩家重新校准（tools/calibrate_levels2.js、tools/level_patch_eval.js）。
   * 目标胜率：第一部 98% → 暗影国王 55%，第二部 90% → 耄耋耄耋 50%。主要手段：敌方 AI 降档、生命下调、削弱敌方增益规则；每关的招牌机制都保留。
   * null 表示去掉该规则。 */
  const DIFFICULTY_V85 = {"1-4": {"hp": 18}, "2-1": {"hp": 18, "mut": {"regen": null}}, "2-2": {"hp": 27, "objective": {"n": 2}}, "2-3": {"objective": {"rounds": 8}}, "3-1": {"ai": {"base": "easy"}, "hp": 30, "mut": {"royalDecree": {"n": 4}, "heroShield": {"max": 11}}}, "3-2": {"hp": 32, "mut": {"phaseShift": {"at": 16, "heal": 3}, "bonusRes": {"every": 2}, "regen": null}, "ai": {"base": "easy"}}, "W1": {"hp": 17}, "W2": {"ai": {"base": "easy"}, "hp": 34}, "W3": {"hp": 18, "mut": {"flowers": {"every": 4}}}, "W4": {"ai": {"base": "easy"}, "hp": 28}, "W5": {"hp": 14, "mut": {"royalDecree": {"n": 3}}}, "W6": {"hp": 20, "mut": {"tax": null}}, "W7": {"hp": 27, "mut": {"heroShield": {"max": 13}, "bonusRes": {"every": 2}, "regen": null}}, "W8": {"ai": {"base": "easy"}, "hp": 25, "mut": {"phaseShift": {"at": 15, "heal": 4}, "flowers": {"every": 4}}}};
  for (const lv of LEVELS) {
    const d = DIFFICULTY_V85[lv.id]; if (!d) continue;
    if (d.hp) lv.enemy.hp = d.hp;
    if (d.ai) lv.enemy.ai = Object.assign({}, lv.enemy.ai, d.ai);
    if (d.objective) lv.objective = Object.assign({}, lv.objective, d.objective);
    for (const [id, v] of Object.entries(d.mut || {})) {
      const i = (lv.mutators || []).findIndex(m => m.id === id && (m.seat === 1 || m.seat == null || id === 'tax'));
      if (i < 0) continue;
      if (v === null) lv.mutators.splice(i, 1); else lv.mutators[i] = Object.assign({}, lv.mutators[i], { params: Object.assign({}, lv.mutators[i].params, v) });
    }
  }

  // 难度调整后的说明文字（与上面的数值一致）
  const TEXT_V85 = {
    '2-2': { tip: '本关目标：累计击碎 2 座敌方雕塑，不需要打败将军本人。嘴硬帮的曾经的王可以献祭直接击碎一座。' },
    '2-3': { tip: '本关目标：撑过 8 回合。奶猪群每回合额外获得 1 奶之力。躺平派的奶壳（本关躺平派牌便宜 1 奶蛋）和嘴硬帮的嘲讽雕塑会很有用。', stars: { 0: '撑过 8 回合' } },
    '3-1': { tip: '「王令」每 3 回合让他获得 4 奶之力；「奶壳护体」让单次伤害最多 11 点，攻击本体会用掉全部奶之力，所以超过 11 的部分先拿去拆他的雕塑。' },
    '3-2': { tip: '两阶段 BOSS：每 2 回合额外获得 1 奶之力，生命降到 16 以下会唤醒奶龙、回复 3 生命并每回合再 +3 奶之力。第二阶段前先把牌库练好，留好嘲讽雕塑或奶壳。' },
    'W3': { tip: '开局你的弃牌堆里有 1 束花，之后每 4 回合再塞 1 束。奶门的世界、奶蛋守护者、西格奶都能帮你删牌；本关市场里删牌牌更多。' },
    'W5': { tip: '老兵开局摆了 3 个训练假人（耐久 3 的嘲讽雕塑），每 3 回合冲锋一次（+3 奶之力）。三星要求删光 7 张普通奶娃和 2 张大笑奶蛙：精英招募、奶蛋守护者、西格奶、奶门的世界都能给删牌机会。' },
    'W6': { subtitle: '耄耋特派员 · 花束攻势', tip: '特派员每 3 回合塞 1 束花。少买精买，把花全部删掉。' },
    'W7': { tip: '橙耄单次最多受到 13 点伤害，每 2 回合额外获得 1 奶之力。多攻击几次：打出一部分牌就先打一下本体，再出牌再打。' },
    'W8': { tip: '两阶段 BOSS：每回合 +1 奶之力和 2 奶壳，每 4 回合送 1 束花；生命降到 15 以下回复 4 生命、唤醒奶虎，之后每回合再 +2 奶之力。' },
  };
  for (const lv of LEVELS) {
    const t = TEXT_V85[lv.id]; if (!t) continue;
    if (t.tip) lv.tip = t.tip;
    if (t.subtitle) lv.subtitle = t.subtitle;
    for (const [i, label] of Object.entries(t.stars || {})) lv.stars[i] = Object.assign({}, lv.stars[i], { label });
  }

  /* ---------------- 关卡 → 对局参数 ---------------- */
  function aiProfile(spec) {
    if (!spec || typeof spec === 'string') return spec || 'normal';
    const base = NW.AI.PROFILES[spec.base || 'normal'];
    return Object.assign({}, base, spec, { bias: Object.assign({}, base.bias, spec.bias || {}) });
  }

  const actOf = level => ACTS.find(a => a.chapters.includes(level.chapter)) || ACTS[0];
  function toMatchOptions(level, seed, playerName) {
    const e = level.enemy, pl = level.player || {};
    return {
      seed, first: 0,
      rules: Object.assign({}, level.rules || {}),
      seats: [
        { name: playerName || '奶蛙指挥官', portrait: 'kungfu', hp: pl.hp, deck: pl.deck, fixedOrder: pl.fixedOrder, extraCards: pl.extraCards, statues: pl.statues },
        { name: e.name, portrait: e.portrait, tint: e.tint, hp: e.hp, deck: e.deck, extraCards: e.extraCards, statues: e.statues },
      ],
      mutators: (level.mutators || []).map(m => JSON.parse(JSON.stringify(m))),
      objective: level.objective || { type: 'defeat' },
      meta: { mode: 'pve', level: level.id, act: actOf(level).id },
    };
  }

  /** 某方当前拥有的全部卡牌 id（牌库 + 手牌 + 弃牌 + 出牌区 + 雕塑 + 删牌区） */
  function ownedIds(state, seat) {
    const p = state.seats[seat];
    return [].concat(p.deck, p.hand, p.discard, p.played, p.statues.map(s => s.uid), p.limbo ? [p.limbo.uid] : []).map(u => state.cards[u]);
  }
  function evalStars(level, state, seat = 0) {
    const p = state.seats[seat], won = state.winner === seat;
    return (level.stars || []).map(s => {
      if (!won) return false;
      switch (s.type) {
        case 'win': return true;
        case 'rounds': return state.round <= s.max;
        case 'hp': return p.hp >= s.min;
        case 'broke': return p.stats.broke >= s.n;
        case 'trashed': return p.stats.trashed >= s.n;
        case 'dealt': return p.stats.dmg >= s.n;
        case 'allies': return p.stats.allies >= s.n;
        case 'bought': return p.stats.bought >= s.n;
        case 'statuesPlayed': return p.stats.statuesPlayed >= s.n;
        case 'extraDraws': return p.stats.extraDraws >= s.n;
        case 'turnPlays': return p.stats.maxTurnPlays >= s.n;
        case 'bigHit': return p.stats.bigHit >= s.n;
        case 'drawn': return p.stats.drawn >= s.n;
        case 'statusPlayed': return p.stats.statusPlayed >= s.n;
        case 'trashedId': return ((p.stats.trashedIds || {})[s.id] || 0) >= s.n;
        case 'purge': { const own = ownedIds(state, seat); return !own.some(id => s.ids.includes(id)); }
        case 'boughtMax': return p.stats.bought <= s.n;
        case 'heroHits': return (p.stats.maxTurnHeroHits || 0) >= s.n;
        default: return false;
      }
    });
  }

  /* ---------------- 存档（本地；联机账号上线后替换为服务端） ---------------- */
  const KEY = 'naiwa.campaign.v1';
  const mem = { data: null };
  const Progress = {
    load() { if (mem.data) return mem.data; try { mem.data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { mem.data = {}; } return mem.data; },
    save(d) { mem.data = d; try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 隐私模式等情况下仅保存在内存 */ } },
    record(levelId, stars) {
      const d = Progress.load(); const old = d[levelId] || { stars: [false, false, false], clears: 0 };
      d[levelId] = { stars: old.stars.map((s, i) => s || !!stars[i]), clears: old.clears + (stars[0] ? 1 : 0) };
      Progress.save(d); return d[levelId];
    },
    unlocked(levelId) {
      const i = LEVELS.findIndex(l => l.id === levelId); if (i <= 0) return true;
      const d = Progress.load(); return !!(d[LEVELS[i - 1].id] && d[LEVELS[i - 1].id].stars[0]);
    },
    reset() { Progress.save({}); },
    actUnlocked(act) { if (!act.unlockAfter) return true; const d = Progress.load(); return !!(d[act.unlockAfter] && d[act.unlockAfter].stars[0]); },
    flag(k, v) { const d = Progress.load(); d._flags = d._flags || {}; if (v === undefined) return !!d._flags[k]; d._flags[k] = v; Progress.save(d); return v; },
  };

  NW.MUTATORS = MUTATORS;
  NW.Campaign = { isElite: l => { const i = LEVELS.indexOf(l); return LEVELS.slice(0, i).some(x => x.chapter === l.chapter && x.chapter === 4 && x.enemy.portrait === l.enemy.portrait); }, label: l => l.chapter === 4 ? '战' + (LEVELS.filter(x => x.chapter === 4).indexOf(l) + 1) : l.id, ACTS, actOf, ownedIds, CHAPTERS, LEVELS, toMatchOptions, evalStars, aiProfile, Progress, mutatorText: m => { const d = MUTATORS[m.id]; return d ? { name: d.name(m), desc: d.desc(m) } : { name: m.id, desc: '' }; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = NW;
})(typeof window !== 'undefined' ? window : globalThis);
