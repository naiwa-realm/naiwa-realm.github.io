/* 奶蛙领域 · 教官奶蛙：教学关分步引导 + 全局一次性新手提示
 *
 * 教学步骤（levels.js 中 level.tutorial）：
 *   { target?: CSS 选择器, text, next: true }        说明步骤，点「下一步」继续
 *   { target?, text, done: ctx => bool }              操作步骤，条件满足后自动继续
 *   ctx = { v: 视角, me: 自己, seat, id(uid) → 卡牌 id, ev(type, pred?) → 本步骤开始后是否出现过该事件 }
 * 步骤只在轮到你、动画结束时显示。
 *
 * 新手提示（HINTS）：某个机制第一次出现时弹出一次，记在本地；规则页可以重置。
 */
(function (root) {
  'use strict';
  const NW = root.NW = root.NW || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const KEY = 'naiwa.hints.v1';
  let seenHints = null;
  const loadSeen = () => { if (seenHints) return seenHints; try { seenHints = new Set(JSON.parse(localStorage.getItem(KEY)) || []); } catch (e) { seenHints = new Set(); } return seenHints; };
  const saveSeen = () => { try { localStorage.setItem(KEY, JSON.stringify(Array.from(seenHints))); } catch (e) { /* 仅内存 */ } };

  const C = {
    steps: null, idx: 0, seen: [], active: false, hint: null, // hint = 当前显示的提示 {key,text,target}
  };

  /* ---------- 教学 ---------- */
  C.start = function (steps) {
    C.steps = steps && steps.length ? steps : null; C.idx = 0; C.seen = []; C.hint = null;
    C.render();
  };
  C.stop = function () { C.steps = null; C.hint = null; C.hide(); };
  C.inTutorial = () => !!(C.steps && C.idx < C.steps.length);

  function ctx() {
    const UI = NW.UI, v = UI.view;
    return {
      v, seat: UI.viewer, me: v.seats[UI.viewer],
      id: uid => v.cards[uid],
      ev: (t, pred) => C.seen.some(e => e.t === t && (!pred || pred(e))),
    };
  }
  function canShow() {
    const UI = NW.UI, v = UI.view;
    if (!UI.session || !v || v.over || UI.session.busy) return false;
    if (!$('#overlay').classList.contains('hidden')) return false;
    if (document.querySelector('.pass')) return false;
    return v.active === UI.viewer && UI.isHuman(UI.viewer);
  }

  /** 每个动作执行后由 UI 调用（events = 该动作产生的事件） */
  C.onEvents = function (events) { if (C.inTutorial()) C.seen.push(...events); };

  /** 动画结束、界面刷新后调用：推进步骤、检查提示、重新定位 */
  C.update = function () {
    if (!NW.UI.view) return;
    if (C.inTutorial()) {
      // 连续推进已经满足条件的操作步骤
      let guard = 0;
      while (C.inTutorial() && guard++ < 20) {
        const s = C.steps[C.idx];
        if (s.done && canShow() && s.done(ctx())) { C.advance(); continue; }
        break;
      }
    } else checkHints();
    C.render();
  };

  C.advance = function () {
    C.idx++; C.seen = [];
    if (!C.inTutorial()) { NW.FX.toast('教学完成！之后遇到新机制时，教官还会提醒你。', 'good'); }
  };

  /* ---------- 渲染 ---------- */
  function box() {
    let el = $('#coach');
    if (!el) {
      el = document.createElement('div'); el.id = 'coach'; el.className = 'coach hidden';
      el.innerHTML = `<div class="co-port"><img alt=""></div><div class="co-body"><div class="co-who">教官奶蛙</div><div class="co-text"></div><div class="co-btns"></div></div><i class="co-arrow"></i>`;
      $('#stage').appendChild(el);
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-coach]'); if (!b) return;
        e.stopPropagation();
        const a = b.dataset.coach;
        if (a === 'next') { C.advance(); C.render(); C.update(); }
        if (a === 'skip') { C.steps = null; C.render(); NW.FX.toast('已跳过教学'); }
        if (a === 'ok') { if (C.hint) { loadSeen().add(C.hint.key); saveSeen(); } C.hint = null; C.render(); C.update(); }
      });
    }
    return el;
  }
  C.hide = function () { const el = $('#coach'); if (el) el.classList.add('hidden'); clearHl(); };
  function clearHl() { document.querySelectorAll('.coach-hl').forEach(e => e.classList.remove('coach-hl')); }

  C.render = function () {
    let item = null, btns = '';
    if (C.inTutorial()) {
      if (!canShow()) return C.hide();
      const s = C.steps[C.idx];
      item = s;
      btns = (s.next ? `<button class="btn gold" data-coach="next">${C.idx === C.steps.length - 1 ? '开始吧' : '下一步'}</button>` : '<span class="co-wait">按提示操作后自动继续</span>')
        + `<span class="co-step">${C.idx + 1} / ${C.steps.length}</span><button class="co-skip" data-coach="skip">跳过教学</button>`;
    } else if (C.hint) {
      item = C.hint;
      btns = '<button class="btn gold" data-coach="ok">知道了</button><span class="co-step">新手提示</span>';
    }
    if (!item) return C.hide();
    const el = box();
    el.querySelector('img').src = NW.UI.artSrc('coach');
    el.querySelector('.co-text').innerHTML = NW.UI.fmt ? NW.UI.fmt(item.text) : esc(item.text);
    el.querySelector('.co-btns').innerHTML = btns;
    el.classList.remove('hidden');
    // 高亮目标
    clearHl();
    const targets = item.target ? Array.from(document.querySelectorAll('#screen-game ' + item.target)) : [];
    targets.forEach(t => t.classList.add('coach-hl'));
    place(el, targets[0]);
  };

  function place(el, target) {
    const FX = NW.FX, W = NW.UI.touch ? 620 : 440;
    el.style.width = W + 'px';
    const H = el.offsetHeight || 140;
    const arrow = el.querySelector('.co-arrow');
    if (!target) { el.style.left = (800 - W / 2) + 'px'; el.style.top = '300px'; arrow.style.display = 'none'; return; }
    const r = FX.rect(target);
    let x = Math.max(16, Math.min(1600 - W - 16, r.cx - W / 2));
    let y, below = false;
    if (r.y - H - 22 > 50) y = r.y - H - 22; else { y = r.y + r.h + 22; below = true; }
    if (y + H > 890) { y = Math.max(56, r.cy - H / 2); x = r.x - W - 26 > 16 ? r.x - W - 26 : Math.min(1600 - W - 16, r.x + r.w + 26); }
    el.style.left = x + 'px'; el.style.top = y + 'px';
    arrow.style.display = '';
    arrow.className = 'co-arrow ' + (below ? 'up' : 'down');
    arrow.style.left = Math.max(20, Math.min(W - 20, r.cx - x)) + 'px';
  }

  /* ---------- 一次性新手提示 ---------- */
  const HINTS = [
    { key: 'energy', when: c => c.mine && c.me.energy > 0, target: '#orb-energy', text: '你有奶劲 {e}！点击你的牌库或奶劲按钮，每点奶劲多抽 1 张牌。' },
    { key: 'statueHand', when: c => c.mine && (c.me.hand || []).some(u => c.card(u).type === 'statue'), target: '#hand .card.t-statue', text: '手里有雕塑牌：打出后它会一直留在场上，从你下回合开始每回合生效。最多 3 座，满了再打需要替换一座。' },
    { key: 'taunt', when: c => c.mine && c.me.power > 0 && c.op.statues.some(s => c.card(s.uid).taunt), target: '#statues-op .card.taunt', text: '对手有「嘲讽」雕塑：它在场时不能攻击本体，必须先一次付出等于耐久的奶之力把它击碎。' },
    { key: 'scrap', when: c => c.mine && c.me.played.some(u => c.card(u).scrap), target: '#playcards .badge.scrap', text: '这张牌可以「献祭」：点击「献祭」并确认，把它送进删牌区，换取一次性效果。' },
    { key: 'choice', when: c => c.v.pending && c.v.pending.seat === c.seat, target: '#pending', text: '需要你做一个选择：点击高亮的牌，或者在横幅上选择其他区域 / 跳过。' },
    { key: 'shield', when: c => c.v.seats.some(s => s.shield > 0), target: '.hero.shielded .portrait', text: '奶壳会挡住对本体的伤害，持续到拥有者的下个回合开始。对手有奶壳时，可以考虑先拆他的雕塑。' },
    { key: 'elite', when: c => c.mine && c.me.coin >= 5 && document.querySelector('#market .card.elite:not(.cant-afford)'), target: '#market .card.elite:not(.cant-afford)', text: '精英招募：买价格 5 及以上的牌时，会获得 1 次删牌机会。删掉起始的普通奶娃，好牌会更常被抽到。' },
    { key: 'trashOp', when: c => c.mine && (c.me.trashOps || []).length > 0, target: '#trashOps', text: '你获得了删牌机会！点「选择要删的牌」，从弃牌堆、本回合打出的牌或自己的雕塑里挑一张确认删除（手牌不能删）。也可以移除市场里价格不高、你不想要的牌。回合结束前用掉，否则失效。' },
    { key: 'statusHand', when: c => c.mine && (c.me.hand || []).some(u => c.card(u).type === 'status'), target: '#hand .card.t-status', text: '状态牌分三类：「增益」强化本回合之后打出的牌（先打它）；「守势」持续到你下回合开始，在对手回合保护你；「蓄势」把资源留到下回合。卡面类型栏会写明是哪一类。' },
    { key: 'guardOpp', when: c => c.mine && (c.op.guards || []).length > 0, target: '#hero-op .tag.guard', text: '对手处于「守势」：惊鸿一瞥让他每回合最多失去 6 点生命，榴莲刺让你每次攻击他本体时自己受伤。多出来的奶之力可以拿去拆雕塑，或者用「破壳」「憋笑」安排进攻时机。' },
    { key: 'curse', when: c => c.me.incomingDiscard > 0, target: '#hero-me .tag.warn', text: '你受到了压制：下回合开始时需要弃掉一张手牌。' },
    { key: 'limbo', when: c => c.me.limbo && c.me.limbo.uid, target: '#limbo', text: '西格奶把这张牌放进了待删区：回合结束时它会进入你的删牌区，在那之前可以点「撤回」。' },
    { key: 'trashZone', when: c => c.mine && (c.me.trash || []).length > 0, target: '#trash-me', text: '这回合删掉或献祭的牌放在右下角的「删牌区」，回合结束时永久删除。在那之前，「根本没有这样的奶蛙」「思考奶蛙」会给你取回机会（删牌区出现「取回」角标），点删牌区就能把其中一张放回弃牌堆——献祭曾经的王拆雕塑后把它取回来，王下次还能再来。' },
    { key: 'market', when: c => c.mine && c.me.coin >= 2 && !(c.me.hand || []).length, target: '#market', text: '手牌打完了。用奶蛋点击市场里的牌购买，最左边的「跑腿奶蛙」永远有货。' },
  ];
  function checkHints() {
    const UI = NW.UI, v = UI.view;
    if (C.hint || UI.mode === 'online' || !UI.session || v.over || UI.session.busy) return;
    if (!$('#overlay').classList.contains('hidden')) return;
    const seen = loadSeen();
    const c = { v, seat: UI.viewer, me: v.seats[UI.viewer], op: v.seats[1 - UI.viewer], card: u => NW.CARDS[v.cards[u]], mine: v.active === UI.viewer && UI.isHuman(UI.viewer) && !v.pending };
    for (const h of HINTS) {
      if (seen.has(h.key)) continue;
      let ok = false; try { ok = !!h.when(c); } catch (e) { ok = false; }
      if (ok && document.querySelector('#screen-game ' + h.target)) { C.hint = h; return; }
    }
  }
  C.resetHints = () => { seenHints = new Set(); saveSeen(); };

  NW.Coach = C;
})(window);
