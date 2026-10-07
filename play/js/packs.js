/* 奶蛙领域 · 扩展包入口（兼容层）
 *
 * 现阶段（v8.3）只做三件事，为后面的「纯数据扩展包 v1」打底：
 *   1. 内容指纹 fingerprint()：把影响规则的数据（引擎版本、默认规则、卡牌效果、市场牌池、已启用扩展包）
 *      算成一串短哈希。联机握手时双方比对，不一致就提示，避免对局中途才发现不同步。
 *   2. 格式检查 validate(manifest)：按扩展包格式 format 1 检查一个 JSON 是否合法，给出错误 / 提醒。
 *      格式说明见仓库 packs/README.md。
 *   3. 已安装列表（localStorage）与启用开关的存储位置。真正把扩展包合并进牌库在 v1 开放，
 *      在那之前 ACCEPTS_INSTALL = false，导入只做检查、不改变游戏。
 *
 * 引擎不需要知道扩展包的存在：v1 会在开局前把扩展包的卡牌以「包id/卡牌id」的名字并入 NW.CARDS，
 * 再把牌池写进 rules.pool。这样回放、联机、AI 都不用改。
 */
(function (root) {
  'use strict';
  const NW = root.NW = root.NW || {};

  NW.VERSION = '8.3';

  const FORMAT = 1;                       // 本版本能读的扩展包格式
  const KEY = 'naiwa.packs.v1';
  const COSMETIC = new Set(['name', 'text', 'flavor', 'art', 'artMode', 'fullArt']); // 不影响规则的字段

  /* ---------- 稳定序列化 + 53 位哈希（cyrb53） ---------- */
  function stable(v, skip) {
    if (Array.isArray(v)) return '[' + v.map(x => stable(x, skip)).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => !(skip && skip.has(k)) && v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k], skip)).join(',') + '}';
    return JSON.stringify(v);
  }
  function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
  }
  const hashOf = (v, skip) => cyrb53(stable(v, skip));

  /* ---------- 已安装扩展包（v1 之前始终为空） ---------- */
  const mem = { data: null };
  function load() {
    if (mem.data) return mem.data;
    try { mem.data = JSON.parse(localStorage.getItem(KEY)) || { packs: [] }; } catch (e) { mem.data = { packs: [] }; }
    if (!Array.isArray(mem.data.packs)) mem.data.packs = [];
    return mem.data;
  }
  function save(d) { mem.data = d; try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 仅内存 */ } }

  /* ---------- 格式检查（format 1） ---------- */
  const EFFECT_KEYS = ['gain', 'n', 'draw', 'shield', 'trash', 'sigmaTrash', 'destroyStatue', 'topdeckNext', 'discardSelf', 'oppDiscard', 'pierce', 'if', 'then', 'else', 'once'];
  const EFFECT_LISTS = ['play', 'ally', 'scrap', 'turnStart', 'onChar', 'onStatus'];
  const CONDS = ['hasStatue', 'otherStatue', 'hasEnergy', 'charsInHand2'];
  const PASSIVES = ['frenzy', 'sigma', 'army', 'gate', 'hold'];
  const ID = /^[a-z0-9][a-z0-9_-]{1,39}$/;
  const SEMVER = /^\d+\.\d+\.\d+$/;

  function checkEffects(list, where, errs) {
    if (!Array.isArray(list)) { errs.push(`${where} 应该是数组`); return; }
    list.forEach((e, i) => {
      const at = `${where}[${i}]`;
      if (!e || typeof e !== 'object' || Array.isArray(e)) { errs.push(`${at} 应该是对象`); return; }
      for (const k of Object.keys(e)) if (!EFFECT_KEYS.includes(k)) errs.push(`${at} 未知效果「${k}」`);
      if (e.gain && !['coin', 'energy', 'power'].includes(e.gain)) errs.push(`${at}.gain 只能是 coin / energy / power`);
      if (e.gain && !(Number.isInteger(e.n) && e.n >= 1 && e.n <= 20)) errs.push(`${at}.n 应为 1–20 的整数`);
      for (const k of ['draw', 'shield', 'discardSelf', 'oppDiscard']) if (k in e && !(Number.isInteger(e[k]) && e[k] >= 1 && e[k] <= 20)) errs.push(`${at}.${k} 应为 1–20 的整数`);
      if (e.trash && !(e.trash.from && Array.isArray(e.trash.from) && e.trash.from.every(z => z === 'hand' || z === 'discard'))) errs.push(`${at}.trash.from 只能包含 hand / discard`);
      if (e.if) { if (!CONDS.includes(e.if)) errs.push(`${at}.if 未知条件「${e.if}」`); checkEffects(e.then || [], at + '.then', errs); if (e.else) checkEffects(e.else, at + '.else', errs); }
      if (e.once) { if (typeof e.once !== 'string') errs.push(`${at}.once 应为字符串`); checkEffects(e.then || [], at + '.then', errs); }
    });
  }

  function validate(m) {
    const errors = [], warnings = [];
    if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, errors: ['不是一个 JSON 对象'], warnings, cards: 0 };
    if (m.format !== FORMAT) {
      if (typeof m.format === 'number' && m.format > FORMAT) errors.push(`这个扩展包是格式 ${m.format}，当前游戏只认识格式 ${FORMAT}，请更新游戏`);
      else errors.push(`缺少 "format": ${FORMAT}`);
    }
    if (!ID.test(m.id || '')) errors.push('id 只能用小写字母、数字、- 和 _，2–40 个字符');
    if (m.id === 'base' || /^naiwa/.test(m.id || '')) errors.push('id 不能以 naiwa 开头，也不能叫 base（留给官方）');
    if (!m.name || typeof m.name !== 'string') errors.push('缺少 name');
    if (!m.author || typeof m.author !== 'string') warnings.push('建议填写 author');
    if (!SEMVER.test(m.version || '')) errors.push('version 应写成 1.0.0 这样的三段数字');
    if (m.game && m.game.min && typeof m.game.min !== 'string') errors.push('game.min 应为字符串，例如 "8.3"');
    if (m.scripts) errors.push('format 1 不支持脚本（scripts），脚本扩展包会在以后的格式里开放');

    const cards = Array.isArray(m.cards) ? m.cards : [];
    if (!Array.isArray(m.cards) || !cards.length) errors.push('cards 至少要有一张牌');
    const seen = new Set();
    cards.forEach((c, i) => {
      const at = `cards[${i}]${c && c.id ? '（' + c.id + '）' : ''}`;
      if (!c || typeof c !== 'object') { errors.push(`${at} 应该是对象`); return; }
      if (!ID.test(c.id || '')) errors.push(`${at} id 格式不对`);
      else if (seen.has(c.id)) errors.push(`${at} id 重复`); else seen.add(c.id);
      if (!c.name) errors.push(`${at} 缺少 name`);
      if (!NW.TYPES || !(c.type in NW.TYPES)) errors.push(`${at} type 只能是 char / status / statue`);
      if (!NW.FACTIONS || !(c.faction in NW.FACTIONS)) errors.push(`${at} faction 只能是 egg / laugh / iron / spirit / neutral`);
      if (!(Number.isInteger(c.cost) && c.cost >= 0 && c.cost <= 12)) errors.push(`${at} cost 应为 0–12 的整数`);
      if (c.type === 'statue' && !(Number.isInteger(c.hp) && c.hp >= 1 && c.hp <= 15)) errors.push(`${at} 雕塑需要 hp（1–15）`);
      if (c.type === 'status' && c.kind && !(c.kind in (NW.STATUS_KINDS || {}))) errors.push(`${at} kind 只能是 buff / guard / charge`);
      if (c.passive && !PASSIVES.includes(c.passive)) errors.push(`${at} 未知被动「${c.passive}」`);
      if (c.guard && !(Number.isInteger(c.guard.cap) || Number.isInteger(c.guard.thorns))) errors.push(`${at} guard 需要 cap 或 thorns`);
      for (const k of EFFECT_LISTS) if (k in c) checkEffects(c[k], `${at}.${k}`, errors);
      if (!c.play && !c.ally && !c.scrap && !c.turnStart && !c.onChar && !c.onStatus && !c.passive) warnings.push(`${at} 没有任何效果`);
      if (c.art && !/^[\w./-]+\.(webp|png|jpg|jpeg)$/i.test(c.art)) errors.push(`${at} art 应为扩展包内的图片路径`);
      if (!c.art) warnings.push(`${at} 没有卡图，将使用占位图`);
    });
    if (m.pool !== undefined) {
      if (!m.pool || typeof m.pool !== 'object' || Array.isArray(m.pool)) errors.push('pool 应写成 {"卡牌id": 张数}');
      else for (const [id, n] of Object.entries(m.pool)) {
        if (!seen.has(id) && !(NW.CARDS && NW.CARDS[id])) errors.push(`pool 里的「${id}」既不是本包的牌也不是本体的牌`);
        if (!(Number.isInteger(n) && n >= 0 && n <= 6)) errors.push(`pool.${id} 张数应为 0–6`);
      }
    } else warnings.push('没有 pool：这些牌不会进入市场');
    if (m.levels) warnings.push('levels（自定义关卡）在 format 1 里先忽略，后续版本支持');
    return { ok: !errors.length, errors, warnings, cards: cards.length };
  }

  /* ---------- 内容指纹 ---------- */
  function rulesContent() {
    const E = NW.engine || {};
    return {
      engine: E.ENGINE_VERSION || 0,
      rules: E.DEFAULT_RULES || null,
      cards: NW.CARDS || {},
      pool: NW.DEFAULT_POOL || [],
      packs: enabled().map(p => ({ id: p.manifest.id, version: p.manifest.version, hash: p.hash })),
    };
  }
  /** 全部规则内容的指纹（联机用） */
  function fingerprint() { return hashOf(rulesContent(), COSMETIC); }
  /** 只算本体（不含扩展包），用来显示「官方 v8.3 · xxxx」 */
  function baseFingerprint() { const c = rulesContent(); c.packs = []; return hashOf(c, COSMETIC); }
  function enabled() { return load().packs.filter(p => p.enabled); }

  NW.Packs = {
    FORMAT,
    ACCEPTS_INSTALL: false,            // v1 打开
    base: { id: 'base', name: '奶蛙领域 本体', version: NW.VERSION },
    validate,
    fingerprint, baseFingerprint,
    short: h => String(h || '').slice(-8).toUpperCase(),
    hashManifest: m => hashOf(m),
    list: () => load().packs.slice(),
    enabled,
    /** v1 前不安装，只返回检查结果 */
    install(manifest) {
      const r = validate(manifest);
      if (!r.ok || !this.ACCEPTS_INSTALL) return Object.assign(r, { installed: false });
      const d = load(), hash = hashOf(manifest);
      d.packs = d.packs.filter(p => p.manifest.id !== manifest.id).concat([{ manifest, hash, enabled: false, at: Date.now() }]);
      save(d);
      return Object.assign(r, { installed: true, hash });
    },
    setEnabled(id, on) { const d = load(); d.packs.forEach(p => { if (p.manifest.id === id) p.enabled = !!on; }); save(d); },
    remove(id) { const d = load(); d.packs = d.packs.filter(p => p.manifest.id !== id); save(d); },
    _stable: stable, _hash: cyrb53,
  };

  /* ---------- 存档导出 / 导入 ---------- */
  const SAVE_KEYS = { campaign: 'naiwa.campaign.v1', settings: 'naiwa.settings.v1', hints: 'naiwa.hints.v1', packs: KEY };
  NW.SaveFile = {
    FORMAT: 1,
    keys: SAVE_KEYS,
    /** 把本地存档打包成一个对象（naiwa-save.json） */
    export() {
      const data = {};
      for (const [k, key] of Object.entries(SAVE_KEYS)) {
        let v = null;
        try { v = JSON.parse(localStorage.getItem(key)); } catch (e) { /* 读不到就看内存 */ }
        if (v == null && k === 'campaign' && NW.Campaign) v = NW.Campaign.Progress.load();
        if (v == null && k === 'settings' && NW.UI) v = NW.UI.settings;
        if (v != null) data[k] = v;
      }
      return { game: 'naiwa-realm', saveFormat: 1, version: NW.VERSION, exportedAt: new Date().toISOString(), data };
    },
    /** 检查导入的存档；返回 {ok, error, summary} */
    check(obj) {
      if (!obj || obj.game !== 'naiwa-realm' || !obj.data) return { ok: false, error: '这不是奶蛙领域的存档文件' };
      if (obj.saveFormat > 1) return { ok: false, error: '存档来自更新版本的游戏，请先更新' };
      const camp = obj.data.campaign || {};
      const levels = Object.keys(camp).filter(k => k[0] !== '_' && camp[k]).length;
      const stars = Object.keys(camp).filter(k => k[0] !== '_').reduce((n, k) => n + ((camp[k] && camp[k].stars) || []).filter(Boolean).length, 0);
      return { ok: true, summary: { levels, stars, version: obj.version || '?', at: obj.exportedAt || '' } };
    },
    /** 覆盖本地存档 */
    import(obj) {
      const r = this.check(obj); if (!r.ok) return r;
      for (const [k, key] of Object.entries(SAVE_KEYS)) {
        if (!(k in obj.data)) continue;
        try { localStorage.setItem(key, JSON.stringify(obj.data[k])); } catch (e) { /* 仅内存 */ }
      }
      if (NW.Campaign && obj.data.campaign) NW.Campaign.Progress.save(obj.data.campaign);
      if (NW.UI && obj.data.settings) Object.assign(NW.UI.settings, obj.data.settings);
      mem.data = null;
      return r;
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = NW;
})(typeof window !== 'undefined' ? window : globalThis);
