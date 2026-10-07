/* 奶蛙领域 · 卡牌数据
 * 纯数据，不含逻辑。引擎（engine.js）按效果原语解释执行。
 *
 * 文本记号：{c}=奶蛋  {e}=奶劲  {p}=奶之力  {h}=生命  {s}=奶壳
 *
 * 效果原语（effects）：
 *   {gain:'coin'|'energy'|'power', n}   获得资源
 *   {draw:n}                             抽牌
 *   {heal:n}                             恢复生命（仅关卡规则使用；卡牌改用奶壳）
 *   {shield:n}                           获得奶壳：吸收对本体的伤害，持续到你下个回合开始
 *   {oppDiscard:n}                       对手下回合开始时弃 n 张
 *   {trash:{from:[...]}}                 获得 1 次删牌机会（本回合内主动使用；也可移除市场中的便宜牌）
 *   {sigmaTrash:true}                    获得 1 次删牌机会，可选范围额外包括抽牌堆
 *   {destroyStatue:{maxHp, optional}}    击碎对手一座雕塑
 *   {topdeckNext:true}                   本回合下一张购入的牌置于牌库顶
 *   {discardSelf:n}                      自己弃 n 张手牌
 *   {if:条件, then:[...], else:[...]}    条件：hasStatue / otherStatue / hasEnergy / charsInHand2
 *   {once:key, then:[...]}               每回合限一次
 *   {pierce:true}                        破壳：本回合你的攻击无视对手奶壳
 *
 * 状态牌体系（type:'status'，kind 决定持续方式）：
 *   buff   增益：本回合有效，强化之后打出的牌 → 先打状态再打角色
 *   guard  守势：效果持续到你下个回合开始，在对手回合保护你；对手可见
 *          guard:{cap:n}     每回合最多失去 n 点生命
 *          guard:{thorns:n}  对手每次攻击你的本体，自己受到 n 点伤害
 *   charge 蓄势：把本回合的资源留到下回合
 * 被动（passive）：frenzy 产生奶之力的牌 +1{p} · sigma 产生奶劲的牌 +1{e} · army 角色牌 +1{p} · gate 删牌 +1{c} · hold 保存奶之力
 *
 * 需要玩家选择的效果（trash / sigmaTrash / destroyStatue / discardSelf）应放在效果列表末尾。
 */
(function (root) {
  'use strict';
  const NW = root.NW = root.NW || {};

  NW.FACTIONS = {
    egg:     { name: '躺平派', short: '躺', color: '#f0c04e', ink: '#5a3d06', desc: '攒奶蛋、套奶壳、删牌，躺着也能赢' },
    laugh:   { name: '绷不住团', short: '绷', color: '#ee6a43', ink: '#5b1a08', desc: '笑到停不下来，奶之力一波打满' },
    iron:    { name: '嘴硬帮', short: '硬', color: '#5f9bd0', ink: '#0e2d4a', desc: '雕塑、嘲讽与压制，就是不破防' },
    spirit:  { name: '西格玛会', short: '西', color: '#a487ec', ink: '#2c1760', desc: '自律抽牌、奶劲连锁、删到只剩精华' },
    neutral: { name: '中立',   short: '奶', color: '#c9c1a2', ink: '#3b3628', desc: '基础牌' },
  };

  NW.TYPES = { char: '角色', status: '状态', statue: '雕塑' };
  NW.STATUS_KINDS = {
    buff:   { name: '增益', desc: '本回合有效，强化之后打出的牌。先打状态，再打角色。' },
    guard:  { name: '守势', desc: '持续到你下个回合开始，在对手回合保护你。对手看得见。' },
    charge: { name: '蓄势', desc: '把本回合的资源留到下回合。' },
  };

  // art: 图片键（assets/art/<key>.webp 为抠图，<key>_photo.webp 为原图裁切）
  // artMode: 'cut' 抠图立绘（默认） | 'photo' 原图满版
  const C = {};
  const def = (id, o) => { C[id] = Object.assign({ id, faction: 'neutral', cost: 0, art: id, artMode: 'cut' }, o); };

  /* ---------- 起始牌（中立） ---------- */
  def('baby',   { name: '普通奶娃', type: 'char', art: 'baby', play: [{ gain: 'coin', n: 1 }], text: { play: '+1{c}' }, flavor: '奶国最常见的居民，口袋里总有一枚奶蛋。' });
  def('laugh',  { name: '大笑奶蛙', type: 'char', art: 'laugh', play: [{ gain: 'power', n: 1 }], text: { play: '+1{p}' }, flavor: '笑声就是它的拳头。' });
  def('kungfu', { name: '功夫奶蛙', type: 'char', art: 'kungfu', play: [{ gain: 'energy', n: 1 }], text: { play: '+1{e}' }, flavor: '马步一扎，奶劲自来。' });

  /* ---------- 杂物牌（不进市场，由关卡塞进你的牌组） ---------- */
  def('flower', { name: '耄耋的花', type: 'char', art: 'flower', junk: true, play: [],
    text: { play: '没有任何作用' }, flavor: '耄耋特派员送的。闻起来像猫粮。删掉它吧。' });

  def('dummy', { name: '训练假人', type: 'statue', art: 'baby', junk: true, hp: 3, taunt: true,
    text: { play: '嘲讽。除了挡路，没有任何作用' }, flavor: '耄耋老兵扎的稻草奶娃，专门用来拖时间。' });

  /* ---------- 常驻市场（无限供应） ---------- */
  def('errand', { name: '跑腿奶蛙', type: 'char', cost: 2, art: 'baby', permanent: true,
    play: [{ gain: 'coin', n: 2 }], scrap: [{ gain: 'power', n: 2 }],
    text: { play: '+2{c}', scrap: '+2{p}' }, flavor: '随叫随到。跑不动了就冲上前线。' });

  /* ---------- 躺平派：经济与回复 ---------- */
  def('rich', { name: '奶蛋守护者', type: 'char', faction: 'egg', cost: 2, art: 'egg',
    play: [{ gain: 'coin', n: 2 }], ally: [{ trash: { from: ['hand', 'discard'], optional: true } }],
    text: { play: '+2{c}', ally: '获得 1 次删牌机会' }, flavor: '圆滚滚的身体里装着整个奶国的积蓄。' });
  def('sleeper', { name: '灰心奶蛙', type: 'char', faction: 'egg', cost: 3, art: 'sleeper',
    play: [{ gain: 'coin', n: 2 }, { if: 'hasStatue', then: [{ draw: 1 }] }], ally: [{ gain: 'coin', n: 1 }, { shield: 4 }],
    text: { play: '+2{c}。若你有雕塑，抽 1 张', ally: '+1{c} +4{s}' }, flavor: '数了一遍奶蛋，叹了口气，又数了一遍。' });
  def('gate', { name: '奶门的世界', type: 'status', kind: 'buff', faction: 'egg', cost: 3, art: 'gate', artMode: 'photo', fullArt: true,
    play: [{ gain: 'coin', n: 1 }, { trash: { from: ['hand', 'discard'] } }], ally: [{ trash: { from: ['hand', 'discard'] } }], passive: 'gate',
    text: { play: '+1{c}，获得 1 次删牌机会。本回合每删 1 张自己的牌 +1{c}', ally: '获得 1 次删牌机会' }, flavor: '推开这扇门，牌库就轻了。' });
  def('chieftain', { name: '奶国大力士', type: 'char', faction: 'egg', cost: 5, art: 'chieftain',
    play: [{ gain: 'coin', n: 2 }, { gain: 'power', n: 2 }], ally: [{ topdeckNext: true }],
    text: { play: '+2{c} +2{p}', ally: '本回合下一张购入的牌置于牌库顶' }, flavor: '叉腰站着，就是一种威慑。' });

  /* ---------- 绷不住团：奶之力爆发 ---------- */
  def('rocket', { name: '火箭奶蛙', type: 'char', faction: 'laugh', cost: 2, art: 'rocket',
    play: [{ gain: 'power', n: 2 }], ally: [{ gain: 'power', n: 2 }],
    text: { play: '+2{p}', ally: '+2{p}' }, flavor: '点火之前请先笑三声。' });
  def('scholar', { name: '学园笑匠', type: 'char', faction: 'laugh', cost: 4, art: 'scholar',
    play: [{ gain: 'power', n: 2 }, { if: 'hasEnergy', then: [{ gain: 'coin', n: 1 }] }], ally: [{ gain: 'energy', n: 1 }],
    text: { play: '+2{p}。若你有{e}，+1{c}', ally: '+1{e}' }, flavor: '课堂笑话考试必考。' });
  def('army', { name: '哈家军', type: 'status', kind: 'buff', faction: 'laugh', cost: 5, art: 'army', artMode: 'photo', fullArt: true,
    play: [{ gain: 'power', n: 1 }], ally: [{ pierce: true }], passive: 'army',
    text: { play: '+1{p}。本回合你每打出一张角色牌 +1{p}', ally: '破壳：本回合攻击无视奶壳' }, flavor: '一声“哈”，万蛙齐笑。' });
  def('frenzy', { name: '狂笑', type: 'status', kind: 'buff', faction: 'laugh', cost: 3, art: 'frenzy',
    play: [{ gain: 'power', n: 1 }], ally: [{ gain: 'power', n: 2 }], passive: 'frenzy',
    text: { play: '+1{p}。本回合之后每张产生{p}的牌再 +1{p}', ally: '+2{p}' }, flavor: '笑到停不下来，力气也停不下来。' });
  def('hold', { name: '憋笑', type: 'status', kind: 'charge', faction: 'laugh', cost: 3, art: 'hold',
    play: [{ gain: 'power', n: 1 }], ally: [{ gain: 'power', n: 2 }], passive: 'hold',
    text: { play: '+1{p}。未用完的{p}留到下回合，且下回合破壳', ally: '+2{p}' }, flavor: '憋住……憋住……下回合一起爆发。' });

  /* ---------- 嘴硬帮：雕塑与压制 ---------- */
  def('nolaugh', { name: '我再也不会笑了', type: 'status', kind: 'guard', faction: 'iron', cost: 3, art: 'nolaugh',
    play: [{ shield: 3 }], ally: [{ gain: 'power', n: 2 }], guard: { thorns: 3 },
    text: { play: '+3{s}。守势：对手每攻击你本体一次，自己受 3 点伤害', ally: '+2{p}' }, flavor: '头盔是榴莲做的，表情是认真的。' });
  def('guard', { name: '铁甲奶蛙', type: 'char', faction: 'iron', cost: 6, art: 'guard', artMode: 'photo', fullArt: true,
    play: [{ gain: 'power', n: 3 }, { if: 'hasStatue', then: [{ gain: 'power', n: 1 }] }], ally: [{ oppDiscard: 1 }],
    text: { play: '+3{p}。若你有雕塑，再 +1{p}', ally: '对手下回合开始时弃 1 张牌' }, flavor: '盔甲是借来的，气势是自己的。' });
  def('king', { name: '曾经的王', type: 'char', faction: 'iron', cost: 6, art: 'king',
    play: [{ gain: 'power', n: 3 }, { gain: 'energy', n: 1 }, { if: 'hasStatue', then: [{ draw: 1 }] }], scrap: [{ destroyStatue: { optional: true } }],
    text: { play: '+3{p} +1{e}。若你有雕塑，抽 1 张', scrap: '击碎对手任意一座雕塑' }, flavor: '王冠没了，背心还在。' });

  /* ---------- 西格玛会：抽牌与精简 ---------- */
  def('cat', { name: '猫耳奶蛙', type: 'char', faction: 'spirit', cost: 3, art: 'cat',
    play: [{ gain: 'coin', n: 1 }, { gain: 'power', n: 1 }], ally: [{ gain: 'energy', n: 1 }],
    text: { play: '+1{c} +1{p}', ally: '+1{e}' }, flavor: '猫耳是真的，奶蛙也是真的。' });
  def('angel', { name: '飞天奶蛙', type: 'char', faction: 'spirit', cost: 4, art: 'angel',
    play: [{ gain: 'energy', n: 2 }, { gain: 'power', n: 1 }], ally: [{ trash: { from: ['hand', 'discard'], optional: true } }],
    text: { play: '+2{e} +1{p}', ally: '获得 1 次删牌机会' }, flavor: '翅膀很小，境界很高。' });
  def('sigma', { name: '西格奶', type: 'status', kind: 'buff', faction: 'spirit', cost: 4, art: 'sigma',
    play: [{ gain: 'energy', n: 1 }, { sigmaTrash: true }], ally: [{ gain: 'energy', n: 1 }], passive: 'sigma',
    text: { play: '+1{e}。本回合每张产生{e}的牌额外 +1{e}。获得 1 次删牌机会（可删抽牌堆中的牌）', ally: '+1{e}' }, flavor: '自律，是最好的奶劲。' });

  def('disdain', { name: '惊鸿一瞥', type: 'status', kind: 'guard', faction: 'spirit', cost: 4, art: 'disdain',
    play: [{ gain: 'energy', n: 1 }], ally: [{ draw: 1 }], guard: { cap: 6 },
    text: { play: '+1{e}。守势：你每回合最多失去 6 点生命', ally: '抽 1 张' }, flavor: '它看了你一眼。你的拳头就软了。' });

  /* ---------- 十二生肖奶雕塑 ---------- */
  const statue = (id, name, faction, cost, hp, o) => def(id, Object.assign({ name, type: 'statue', faction, cost, hp }, o));
  statue('rooster', '奶鸡', 'egg', 5, 4, { turnStart: [{ if: 'otherStatue', then: [{ gain: 'coin', n: 2 }], else: [{ gain: 'coin', n: 1 }] }], text: { play: '回合开始：+1{c}；若有另一座雕塑，改为 +2{c}' } });
  statue('goat', '奶羊', 'egg', 4, 4, { turnStart: [{ gain: 'coin', n: 1 }, { shield: 2 }], text: { play: '回合开始：+1{c} +2{s}' } });
  statue('pig', '奶猪', 'egg', 6, 4, { turnStart: [{ if: 'charsInHand2', then: [{ gain: 'coin', n: 2 }] }], text: { play: '回合开始：若手牌中至少有 2 张角色，+2{c}' } });
  statue('dragon', '奶龙', 'laugh', 7, 5, { turnStart: [{ if: 'otherStatue', then: [{ gain: 'power', n: 3 }], else: [{ gain: 'power', n: 2 }] }], text: { play: '回合开始：+2{p}；若有另一座雕塑，改为 +3{p}' } });
  statue('tiger', '奶虎', 'laugh', 6, 4, { turnStart: [{ gain: 'power', n: 1 }, { if: 'otherStatue', then: [{ gain: 'power', n: 1 }] }], text: { play: '回合开始：+1{p}；若有另一座雕塑，再 +1{p}' } });
  statue('monkey', '奶猴', 'laugh', 5, 3, { turnStart: [{ if: 'otherStatue', then: [{ draw: 2 }, { discardSelf: 1 }] }], text: { play: '回合开始：若有另一座雕塑，抽 2 张，然后弃 1 张' } });
  statue('dog', '奶狗', 'iron', 5, 6, { taunt: true, onChar: [{ once: 'dog', then: [{ gain: 'power', n: 1 }] }], text: { play: '嘲讽。每回合首次打出角色牌时 +1{p}' } });
  statue('ox', '奶牛', 'iron', 6, 7, { taunt: true, turnStart: [{ gain: 'power', n: 1 }], text: { play: '嘲讽。回合开始：+1{p}' } });
  statue('horse', '奶马', 'iron', 5, 4, { turnStart: [{ gain: 'energy', n: 1 }], text: { play: '回合开始：+1{e}' } });
  statue('snake', '奶蛇', 'spirit', 4, 3, { onStatus: [{ gain: 'coin', n: 1 }], text: { play: '每次打出状态牌：+1{c}' } });
  statue('rabbit', '奶兔', 'spirit', 4, 3, { onStatus: [{ gain: 'energy', n: 1 }], text: { play: '每次打出状态牌：+1{e}' } });
  statue('rat', '奶鼠', 'spirit', 3, 2, { turnStart: [{ gain: 'energy', n: 1 }], text: { play: '回合开始：+1{e}' } });

  NW.CARDS = C;

  // 默认市场牌池（每个 id 出现的次数 = 张数）
  NW.DEFAULT_POOL = [].concat(
    Array(3).fill('rich'), Array(2).fill('sleeper'), Array(2).fill('chieftain'), Array(2).fill('gate'),
    Array(3).fill('rocket'), Array(2).fill('scholar'), Array(2).fill('frenzy'), Array(2).fill('hold'), Array(2).fill('army'),
    Array(2).fill('guard'), Array(2).fill('king'), Array(2).fill('nolaugh'),
    Array(3).fill('cat'), Array(2).fill('angel'), Array(2).fill('sigma'), Array(2).fill('disdain'),
    ['rooster', 'rooster', 'goat', 'goat', 'pig', 'dragon', 'tiger', 'tiger', 'monkey', 'dog', 'dog', 'ox', 'horse', 'horse', 'snake', 'snake', 'rabbit', 'rabbit', 'rat', 'rat']
  );

  // 便于 Node 端（PvP 服务器 / 测试）加载
  if (typeof module !== 'undefined' && module.exports) module.exports = NW;
})(typeof window !== 'undefined' ? window : globalThis);
