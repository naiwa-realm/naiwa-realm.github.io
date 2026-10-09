/* 奶蛙领域 · 菜单、远征地图、联机大厅、弹窗 */
(function (root) {
  'use strict';
  const NW = root.NW = root.NW || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CARDS = NW.CARDS, FACTIONS = NW.FACTIONS;

  const S = {};
  NW.Screens = S;

  S.show = name => {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === 'screen-' + name));
    S.close();
    if (NW.UI && NW.UI.fitStage) { NW.UI.fitStage(); NW.UI.closeSheet && NW.UI.closeSheet(); }
  };
  /* 触控菜单：顶栏小按钮的大号合集 */
  S.menu = () => {
    const sp = { 1: '1×', 1.6: '1.6×', 2.5: '2.5×' }[NW.FX.speed] || '1×';
    S.modal(`<div class="eyebrow">菜单</div><h2>对局菜单</h2><div class="menu-grid">
      ${NW.UI.mode === 'pve' ? '<button class="btn big ghost" data-top="mission">关卡任务</button>' : ''}
      <button class="btn big ghost" data-top="log">对局记录</button><button class="btn big ghost" data-top="codex">卡牌图鉴</button><button class="btn big ghost" data-top="rules">玩法说明</button>
      <button class="btn big ghost" data-top="speed">动画 ${sp}</button><button class="btn big ghost" data-top="sound">${NW.FX.sound ? '音效 开' : '音效 关'}</button><button class="btn big ghost" data-top="confirm">${NW.UI.settings.confirmTap ? '出牌确认 开' : '出牌确认 关'}</button>
      <button class="btn big ghost" data-top="concede">认输</button><button class="btn big ghost" data-top="exit">退出对局</button></div>`, 'narrow');
  };

  /* ---------- 弹窗 ---------- */
  S.modal = (html, cls = '') => {
    const o = $('#overlay');
    o.innerHTML = `<div class="modal ${cls}"><button class="x" data-close>×</button>${html}</div>`;
    o.classList.remove('hidden');
    NW.UI && NW.UI.hidePreview && NW.UI.hidePreview();
    return o.firstElementChild;
  };
  S.close = () => { const o = $('#overlay'); o.classList.add('hidden'); o.innerHTML = ''; if (NW.Coach && NW.UI && NW.UI.session) setTimeout(() => NW.Coach.update(), 0); };

  /* ---------- 主菜单 ---------- */
  S.renderMenu = () => {
    const stars = Object.values(NW.Campaign.Progress.load()).reduce((n, l) => n + (l && l.stars ? l.stars.filter(Boolean).length : 0), 0);
    const total = NW.Campaign.LEVELS.length * 3;
    const diff = S.diff || 'normal';
    $('#screen-menu').innerHTML = `
      <div class="menu-bg"></div>
      <div class="menu-frogs">
        <img src="${NW.UI.artSrc('laugh')}" style="left:90px;height:380px;animation-delay:-1s">
        <img src="${NW.UI.artSrc('egg')}" style="left:330px;height:150px;animation-delay:-2.2s">
        <img src="${NW.UI.artSrc('dragon')}" style="left:430px;height:170px;animation-delay:-.4s">
        <img src="${NW.UI.artSrc('cat')}" style="right:420px;height:170px;animation-delay:-1.6s">
        <img src="${NW.UI.artSrc('ox')}" style="right:330px;height:150px;animation-delay:-3s">
        <img src="${NW.UI.artSrc('kungfu')}" style="right:60px;height:360px;animation-delay:-2.6s">
      </div>
      <div class="logo"><h1>奶蛙领域</h1><p>THE MILK REALM · 奶国牌库对决</p></div>
      <div class="menu-list">
        <button class="menu-btn" data-go="ai"><span class="mi">战</span><span><b>快速对战</b><small>与电脑对手来一局</small></span>
          <span class="pick">${Object.entries(NW.AI.PROFILES).map(([k, p]) => `<span role="button" data-diff="${k}" class="${k === diff ? 'on' : ''}">${p.label}</span>`).join('')}</span></button>
        <button class="menu-btn" data-go="campaign"><span class="mi">征</span><span><b>奶国远征</b><small>PvE 关卡 · 已获得 ★ ${stars} / ${total}</small></span></button>
        <button class="menu-btn" data-go="lobby"><span class="mi">对</span><span><b>玩家对战</b><small>同屏热座 · 联机对战（测试版）</small></span></button>
        <div style="display:flex;gap:10px">
          <button class="menu-btn" data-go="codex" style="flex:1;padding:10px 16px"><span class="mi" style="width:34px;height:34px;font-size:18px">鉴</span><span><b style="font-size:17px">卡牌图鉴</b></span></button>
          <button class="menu-btn" data-go="rules" style="flex:1;padding:10px 16px"><span class="mi" style="width:34px;height:34px;font-size:18px">规</span><span><b style="font-size:17px">玩法说明</b></span></button>
        </div>
        <div style="display:flex;gap:10px">
          <button class="menu-btn" data-go="packs" style="flex:1;padding:10px 16px"><span class="mi" style="width:34px;height:34px;font-size:18px">扩</span><span><b style="font-size:17px">扩展包</b></span></button>
          <button class="menu-btn" data-go="saves" style="flex:1;padding:10px 16px"><span class="mi" style="width:34px;height:34px;font-size:18px">档</span><span><b style="font-size:17px">存档</b></span></button>
        </div>
      </div>
      <div class="menu-foot">拖动手牌打出 · 拖动奶之力瞄准 · 空格 全部打出 · E 结束回合 · 右键查看卡牌</div>
      <div class="menu-ver">v${NW.VERSION}${NW.Packs ? ' · ' + NW.Packs.short(NW.Packs.fingerprint()) : ''}</div>`;
  };

  /* ---------- 扩展包（入口：本体信息、导入检查、社区目录） ---------- */
  const readJSONFile = (accept, cb) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept;
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; const r = new FileReader();
      r.onload = () => { let obj = null, err = null; try { obj = JSON.parse(r.result); } catch (e) { err = 'JSON 解析失败：' + e.message; } cb(obj, err, f.name); };
      r.readAsText(f); };
    inp.click();
  };
  S.packs = () => {
    const P = NW.Packs, list = P.list();
    const el = S.modal(`<div class="eyebrow">扩展包 · 格式 ${P.FORMAT}</div><h2>扩展包</h2>
      <div class="pk-list">
        <div class="pk-item base"><span class="pk-ic">蛙</span><div><b>${esc(P.base.name)}</b><small>官方 · v${esc(P.base.version)} · 内容指纹 ${P.short(P.baseFingerprint())}</small></div><span class="pk-tag on">已启用</span></div>
        ${list.length ? list.map(p => `<div class="pk-item"><span class="pk-ic">扩</span><div><b>${esc(p.manifest.name)}</b><small>${esc(p.manifest.author || '')} · v${esc(p.manifest.version)}</small></div><span class="pk-tag">${p.enabled ? '已启用' : '未启用'}</span></div>`).join('') : '<p class="pk-empty">还没有安装扩展包。</p>'}
      </div>
      <div class="pk-note"><b>扩展包 v1 正在开发中。</b>现在可以先导入一个扩展包 JSON 做格式检查（不会改变游戏）；正式版会支持安装、启用、管理，并在联机时自动比对双方的扩展包。</div>
      <div class="row-btns"><button class="btn gold" data-pk="check">导入并检查扩展包…</button></div>
      <div id="pkReport"></div>
      <h3 class="pk-h">社区扩展包</h3><div id="pkCommunity" class="pk-list"><p class="pk-empty">读取中…</p></div>`, 'narrow pk-modal');
    const box = el.querySelector('#pkCommunity');
    const none = msg => { box.innerHTML = `<p class="pk-empty">${msg}</p>`; };
    if (!/^https?:/.test(location.protocol)) return none('从网站打开游戏时，这里会列出 packs/index.json 里的社区扩展包。');
    fetch('../packs/index.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(j => {
      const packs = (j && j.packs) || [];
      if (!packs.length) return none('暂时还没有社区扩展包，欢迎投稿！');
      box.innerHTML = packs.map(p => `<div class="pk-item"><span class="pk-ic">${p.official ? '官' : '社'}</span><div><b>${esc(p.name)}</b><small>${esc(p.author || '')} · v${esc(p.version || '?')}${p.description ? ' · ' + esc(p.description) : ''}</small></div><span class="pk-tag">v1 开放后可安装</span></div>`).join('');
    }).catch(() => none('没有读到社区目录（离线版或网络问题）。'));
  };
  S.packReport = (obj, err, file) => {
    const box = $('#pkReport'); if (!box) return;
    if (err) { box.innerHTML = `<div class="pk-report bad"><b>${esc(file)}</b><p>${esc(err)}</p></div>`; return; }
    const r = NW.Packs.validate(obj);
    box.innerHTML = `<div class="pk-report ${r.ok ? 'good' : 'bad'}"><b>${esc((obj && obj.name) || file)}</b>
      <p>${r.ok ? `格式检查通过：${r.cards} 张牌，指纹 ${NW.Packs.short(NW.Packs.hashManifest(obj))}。安装功能将在扩展包 v1 开放。` : `发现 ${r.errors.length} 个问题：`}</p>
      ${r.errors.length ? `<ul>${r.errors.slice(0, 12).map(e => `<li>${esc(e)}</li>`).join('')}${r.errors.length > 12 ? `<li>……还有 ${r.errors.length - 12} 条</li>` : ''}</ul>` : ''}
      ${r.warnings.length ? `<ul class="warn">${r.warnings.slice(0, 6).map(e => `<li>提醒：${esc(e)}</li>`).join('')}</ul>` : ''}</div>`;
  };

  /* ---------- 存档：导出 / 导入 naiwa-save.json ---------- */
  S.saves = () => {
    const SF = NW.SaveFile, cur = SF.check(SF.export()).summary;
    S.modal(`<div class="eyebrow">存档</div><h2>导出 / 导入存档</h2>
      <p>存档保存在这个浏览器里。换设备、换浏览器或清除浏览器数据前，先导出一份 <b>naiwa-save.json</b>，到新地方再导入。</p>
      <div class="pk-item base"><span class="pk-ic">档</span><div><b>当前存档</b><small>已通过 ${cur.levels} 关 · ★ ${cur.stars} · 含远征进度、设置、新手提示记录</small></div></div>
      <div class="row-btns"><button class="btn gold" data-sv="export">导出存档</button><button class="btn ghost" data-sv="import">导入存档…</button><button class="btn ghost" data-sv="copy">复制为文本</button><button class="btn ghost" data-sv="paste">粘贴文本导入</button></div>
      <div id="svBox"></div>`, 'narrow pk-modal');
  };
  S.saveImportConfirm = obj => {
    const r = NW.SaveFile.check(obj), box = $('#svBox'); if (!box) return;
    if (!r.ok) { box.innerHTML = `<div class="pk-report bad"><p>${esc(r.error)}</p></div>`; return; }
    S.pendingSave = obj;
    box.innerHTML = `<div class="pk-report good"><p>读到存档：v${esc(r.summary.version)}，已通过 ${r.summary.levels} 关，★ ${r.summary.stars}${r.summary.at ? '，导出于 ' + esc(r.summary.at.slice(0, 16).replace('T', ' ')) : ''}。</p>
      <p>导入会<b>覆盖</b>这个浏览器里现在的存档。</p><div class="row-btns"><button class="btn gold" data-sv="apply">覆盖并导入</button></div></div>`;
  };

  /* ---------- 远征（第一部：章节列表；第二部：博古架） ---------- */
  S.renderCampaign = () => {
    const C = NW.Campaign, prog = C.Progress.load();
    const acts = C.ACTS.map(a => ({ a, open: C.Progress.actUnlocked(a) }));
    if (S.campAct == null) S.campAct = acts[1].open && !C.Progress.unlocked('W2') && C.Progress.flag('act2intro') ? 2 : 1;
    if (!acts.find(x => x.a.id === S.campAct).open) S.campAct = 1;
    const starsOf = ids => ids.reduce((n, id) => n + ((prog[id] && prog[id].stars) || []).filter(Boolean).length, 0);
    const tabs = `<div class="act-tabs">${acts.map(({ a, open }) => {
      const ids = C.LEVELS.filter(l => a.chapters.includes(l.chapter)).map(l => l.id);
      return `<button class="act-tab ${S.campAct === a.id ? 'on' : ''}" data-act-tab="${a.id}" ${open ? '' : 'disabled'}><small>${a.sub}</small><b>${open ? a.name : '？？？'}</b><em>${open ? `★ ${starsOf(ids)} / ${ids.length * 3}` : `打败暗影国王后解锁`}</em></button>`;
    }).join('')}</div>`;
    const node = (l, open) => {
      const lab = l.chapter === 4 ? '战' + (C.LEVELS.filter(x => x.chapter === 4).indexOf(l) + 1) : l.id;
      const p = prog[l.id], st = (p ? p.stars : [false, false, false]).map(x => `<span class="${x ? 'on' : ''}">★</span>`).join('');
      const eliteN = l.chapter === 4 && C.LEVELS.filter(x => x.chapter === 4 && C.LEVELS.indexOf(x) < C.LEVELS.indexOf(l)).some(x => x.enemy.portrait === l.enemy.portrait);
      return `<button class="level-node ${eliteN ? 'elite' : ''}" data-level="${l.id}" ${open ? '' : 'disabled'}><span class="lid">${lab}</span>
        <span class="lp">${NW.UI.portraitHTML(l.enemy.portrait, l.enemy.tint)}</span>
        <span><b>${open ? l.title : '未解锁'}</b><small>${open ? l.subtitle : '通关上一关后开放'}</small></span><span class="lstars">${st}</span></button>`;
    };
    let body;
    if (S.campAct === 1) {
      const act = C.ACTS[0], K = 0.77;
      const lvls = C.LEVELS.filter(l => act.chapters.includes(l.chapter));
      const pins = lvls.map(l => {
        const [x, y] = act.map[l.id], open = C.Progress.unlocked(l.id), p = prog[l.id], got = p ? p.stars.filter(Boolean).length : 0, cleared = p && p.stars[0];
        return `<button class="map-pin ${open ? '' : 'locked'} ${cleared ? 'cleared' : ''} ${open && !cleared ? 'current' : ''}" data-level="${l.id}" ${open ? '' : 'disabled'} style="left:${x * K}px;top:${y * K}px" title="${open ? esc(l.id + ' ' + l.title) : '未解锁'}">
          ${open ? `<span class="pin-port">${NW.UI.portraitHTML(l.enemy.portrait, l.enemy.tint)}</span><span class="pin-name">${esc(l.title)}</span>` : '<span class="pin-lock">🔒</span>'}
          <span class="pin-stars">${'<i class="on">★</i>'.repeat(got)}${'<i>★</i>'.repeat(3 - got)}</span></button>`;
      }).join('');
      body = `<div class="map-wrap"><img class="map-img" src="${NW.UI.artSrc('map1')}" alt="">${pins}</div>
      <div class="shelf-side map-side">
        <h3>奶国远征</h3><p>从奶蛋平原的小村出发，穿过迷雾奶林和嘴硬要塞，攻进奶国王城，最后在废墟深处挑战暗影国王。</p>
        <div class="side-list">${C.CHAPTERS.filter(ch => !ch.act || ch.act === 1).map(ch => `<div class="side-ch">第${'一二三'[ch.id - 1]}章 · ${ch.name}</div>` + C.LEVELS.filter(l => l.chapter === ch.id).map(l => node(l, C.Progress.unlocked(l.id))).join('')).join('')}</div>
      </div>`;
    } else {
      const act = C.ACTS[1], K = 0.775; // 博古架缩放：原图 1086 高 → 842
      const lvls = C.LEVELS.filter(l => act.chapters.includes(l.chapter));
      const done = C.Progress.unlocked('W8') && prog.W8 && prog.W8.stars[0];
      const figs = lvls.map((l, i) => {
        const pos = act.shelf[l.id], open = C.Progress.unlocked(l.id), p = prog[l.id], got = p ? p.stars.filter(Boolean).length : 0;
        const cleared = p && p.stars[0];
        const elite = lvls.slice(0, i).some(x => x.enemy.portrait === l.enemy.portrait); // 同一只猫第二次出场：背后金光
        return `<button class="shelf-fig ${open ? '' : 'locked'} ${cleared ? 'cleared' : ''} ${open && !cleared ? 'current' : ''} ${elite ? 'elite' : ''}" data-level="${l.id}" ${open ? '' : 'disabled'}
          style="left:${pos.x * K}px;top:${pos.floor * K}px;--h:${pos.h * K}px;--w:${pos.w * K}px" title="${open ? esc(l.title) : '未解锁'}">
          ${elite ? '<span class="aura"></span>' : ''}<img src="${NW.UI.artSrc(l.enemy.portrait)}" alt="">
          <span class="plaque"><b>${i + 1}</b>${'<i class="on">★</i>'.repeat(got)}${'<i>★</i>'.repeat(3 - got)}</span></button>`;
      }).join('');
      body = `<div class="shelf-wrap">
        <div class="shelf-glow"></div>
        <img class="shelf-img" src="${NW.UI.artSrc('shelf')}" alt="">
        ${figs}
        <button class="drawer d1" data-story="prologue" style="left:${510 * K}px;top:${716 * K}px;width:${200 * K}px;height:${66 * K}px" title="序章">序章</button>
        <button class="drawer d2" data-story="epilogue" style="left:${735 * K}px;top:${716 * K}px;width:${200 * K}px;height:${66 * K}px" ${done ? '' : 'disabled'} title="终章">${done ? '终章' : '🔒'}</button>
      </div>
      <div class="shelf-side">
        <h3>奶国之战</h3><p>耄耋军团入侵奶家军。为了守护哈家正统，一格一格打上去，把耄耋军团摆上博古架。</p>
        <p class="hint">这一部的星星靠完成指定操作获得：抽牌、删牌、一回合出很多牌、一击打出大伤害……</p>
        <div class="side-list">${lvls.map(l => node(l, C.Progress.unlocked(l.id))).join('')}</div>
      </div>`;
    }
    $('#screen-campaign').className = 'screen' + ($('#screen-campaign').classList.contains('on') ? ' on' : '') + ' act-' + S.campAct;
    $('#screen-campaign').innerHTML = `
      <div class="menu-bg"></div>
      <button class="btn ghost back-btn" data-go="menu">← 返回</button>
      <div class="camp-title" style="display:none"><h2>${S.campAct === 1 ? '奶国远征' : '奶国之战'}</h2><p>${S.campAct === 1 ? '三章九关。第一章是新手教学，之后每关有独特规则与三颗星的挑战目标。' : '第二部 · 八关。打败暗影国王之后，新的敌人来了。'}</p></div>
      ${tabs}${body}`;
    // 第二部刚解锁 / 刚通关：自动播放序章 / 终章
    const auto = acts[1].open && !C.Progress.flag('act2intro') ? 'prologue' : S.campAct === 2 && prog.W8 && prog.W8.stars[0] && !C.Progress.flag('act2outro') ? 'epilogue' : null;
    if (auto) { C.Progress.flag(auto === 'prologue' ? 'act2intro' : 'act2outro', true); if (auto === 'prologue') { S.campAct = 2; S.renderCampaign(); } setTimeout(() => S.story(auto), 80); }
  };

  /* ---------- 剧情演出：一句一句播放，点「继续」翻页 ---------- */
  S.story = (which, onDone) => {
    const act = NW.Campaign.ACTS[1], lines = act[which] || [];
    S._story = { lines, i: 0, which, onDone };
    S.storyRender();
  };
  S.storyRender = () => {
    const st = S._story, ln = st.lines[st.i]; if (!ln) return;
    S.modal(`<div class="story ${st.which}"><div class="eyebrow">${st.which === 'prologue' ? '奶国之战 · 序章' : '奶国之战 · 终章'}</div>
      <div class="story-stage"><div class="sport">${NW.UI.portraitHTML(ln.art, ln.tint)}</div>
        <div class="sbubble"><b>${esc(ln.who)}</b><p>${esc(ln.text)}</p></div></div>
      <div class="row-btns"><span class="sstep">${st.i + 1} / ${st.lines.length}</span>
        <button class="btn ghost" data-story-skip>跳过</button>
        <button class="btn big gold" data-story-next>${st.i === st.lines.length - 1 ? (st.which === 'prologue' ? '出征！' : '完') : '继续 ›'}</button></div></div>`, 'narrow story-modal');
  };
  S.storyNext = skip => {
    const st = S._story; if (!st) return;
    if (!skip && st.i < st.lines.length - 1) { st.i++; return S.storyRender(); }
    S._story = null; S.close();
    if (st.onDone) st.onDone();
  };

  S.brief = (id, inGame) => {
    const C = NW.Campaign, l = C.LEVELS.find(x => x.id === id);
    const e = l.enemy, story = l.story[0];
    const obj = l.objective.type === 'survive' ? `撑过 ${l.objective.rounds} 回合` : l.objective.type === 'breakStatues' ? `累计击碎 ${l.objective.n} 座敌方雕塑` : `击败 ${e.name}（${e.hp} 生命）`;
    S.modal(`<div class="eyebrow">${l.chapter === 4 ? '奶国之战 · ' : '关卡 '}${C.label(l)} · ${esc(l.subtitle)}</div><h2>${esc(l.title)}</h2>
      <div class="brief"><div class="bport">${NW.UI.portraitHTML(story.art, story.tint)}</div>
        <div>${l.story.map((x, i) => `<div class="speech ${i ? 'reply' : ''}">${i ? `<span class="mini">${NW.UI.portraitHTML(x.art, x.tint)}</span>` : ''}<b>${esc(x.who)}</b>${esc(x.text)}</div>`).join('')}
          <div class="obj">🎯 胜利条件：${obj}</div>
          ${(l.mutators || []).length ? `<div class="mut-list">${l.mutators.map(m => { const t = C.mutatorText(m); return `<div class="mut"><b>${esc(t.name)}</b>${esc(t.desc)}</div>`; }).join('')}</div>` : ''}
          <p style="font-size:13px;color:#cfd6be">💡 ${esc(l.tip)}</p>
          <div class="stats">${l.stars.map(s => `<span>★ ${esc(s.label)}</span>`).join('')}</div>
        </div></div>
      <div class="row-btns">${inGame ? '<button class="btn big gold" data-close>继续对局</button>' : `<button class="btn big gold" data-start-level="${l.id}">开始挑战</button>`}</div>`);
  };

  /* ---------- 大厅 ---------- */
  S.renderLobby = () => {
    const name = S.netName || '奶蛙' + Math.floor(Math.random() * 900 + 100);
    S.netName = name;
    $('#screen-lobby').innerHTML = `
      <div class="menu-bg"></div>
      <button class="btn ghost back-btn" data-go="menu">← 返回</button>
      <div class="camp-title"><h2>玩家对战</h2><p>PvP 采用「先手首回合只抽 3 张」的规则，双方胜率约 51 : 49。</p></div>
      <div class="lobby">
        <div class="panel"><h3>同屏对战</h3><p>两人共用一台设备轮流操作。回合交接时会遮住手牌。</p>
          <div class="field"><label>玩家一（先手）</label><input id="hsA" value="玩家一" maxlength="8"></div>
          <div class="field"><label>玩家二</label><input id="hsB" value="玩家二" maxlength="8"></div>
          <div class="row-btns"><button class="btn big gold" data-hotseat>开始对战</button></div></div>
        <div class="panel"><h3>联机对战 <span class="mode-chip">测试版</span></h3><p>点对点直连：两台设备各复制一次连接码（用微信发就行），不需要服务器。同一 Wi-Fi / 热点、同一个国家选「直连」；<b>跨国</b>选「Radmin 跨国」：两人都开 Radmin VPN 进同一个网络，填上自己的 Radmin 地址。</p>
          <div class="field"><label>你的名字</label><input id="netName" value="${esc(name)}" maxlength="8"></div>
          <div class="field"><label>连接方式</label><input type="hidden" id="netKind" value="${S.netMode || 'rtc'}">
            <div class="seg" id="netSeg">${[['rtc', '直连', '同国家 / 同 Wi-Fi'], ['radmin', 'Radmin 跨国', '两人都开 Radmin'], ['bc', '本地测试', '同一浏览器两个标签页']].map(([k, a, b]) => `<button type="button" class="seg-b${(S.netMode || 'rtc') === k ? ' on' : ''}" data-netmode="${k}"><b>${a}</b><small>${b}</small></button>`).join('')}</div></div>
          <div class="field" id="vipField"><label>我的 Radmin 地址（Radmin 窗口里自己名字旁的 26.x.x.x）</label><input id="netVip" value="${esc(S.vip())}" placeholder="26.x.x.x" maxlength="15" inputmode="decimal"></div>
          <div class="field" id="roomField" style="display:none"><label>房间号</label><input id="netRoom" value="${Math.floor(Math.random() * 9000 + 1000)}" maxlength="12"></div>
          <div class="row-btns"><button class="btn big gold" data-net="host">创建房间</button><button class="btn big ghost" data-net="guest">加入房间</button></div>
          <div class="net-status" id="netStatus"></div>
          <div class="rtc-box" id="rtcBox" style="display:none">
            <div class="field"><label id="rtcOutLabel">你的连接码（复制发给对方）</label><textarea id="rtcOut" readonly rows="2"></textarea><button class="btn ghost" data-rtc="copy">复制连接码</button></div>
            <div class="field" id="rtcInField"><label id="rtcInLabel">粘贴对方的连接码</label><textarea id="rtcIn" rows="2" placeholder="NW1…"></textarea><button class="btn gold" data-rtc="apply">确定</button></div>
          </div>
          </div>
      </div>`;
    const sync = () => {
      const k = $('#netKind').value; S.netMode = k;
      $('#vipField').style.display = k === 'radmin' ? '' : 'none'; $('#roomField').style.display = k === 'bc' ? '' : 'none';
      document.querySelectorAll('#netSeg .seg-b').forEach(b => b.classList.toggle('on', b.dataset.netmode === k));
      S.resetNet();
    };
    $('#netSeg').onclick = e => { const b = e.target.closest('[data-netmode]'); if (!b || b.dataset.netmode === $('#netKind').value) return; $('#netKind').value = b.dataset.netmode; sync(); };
    sync();
  };
  /** 记住 Radmin 地址（每台电脑固定） */
  S.vip = v => { try { if (v === undefined) return localStorage.getItem('naiwa.vip') || ''; localStorage.setItem('naiwa.vip', v); } catch (e) { /* 隐私模式 */ } return v || ''; };
  /** 切换连接方式 / 重新点创建或加入：清空上一次的连接码、输入框和状态，关掉没连上的直连 */
  S.resetNet = () => {
    NW.Main.resetRtc && NW.Main.resetRtc();
    S.rtcRole = null; S.rtcStep = null;
    const box = $('#rtcBox'); if (!box) return;
    box.style.display = 'none'; $('#rtcOut').value = ''; $('#rtcIn').value = '';
    $('#rtcInField').style.display = ''; $('#rtcOutLabel').parentNode.style.display = '';
    S.rtcUi.status('');
  };

  /* ---------- 结算 ---------- */
  S.result = UI => {
    const v = UI.view, st = UI.session.state;
    const hot = UI.mode === 'hotseat';
    const won = st.winner === UI.viewer;
    const w = st.seats[st.winner];
    const me = st.seats[UI.viewer];
    let starsHTML = '', title, sub, art;
    if (UI.mode === 'pve') {
      const lv = UI.opts.level, stars = NW.Campaign.evalStars(lv, st, 0);
      if (won) NW.Campaign.Progress.record(lv.id, stars);
      starsHTML = `<div class="stars">${lv.stars.map((s, i) => `<div class="star ${stars[i] ? 'got' : ''}" style="animation-delay:${i * .25}s"><b>★</b>${esc(s.label)}</div>`).join('')}</div>`;
    }
    const reason = { hp: '', concede: '（对手认输）', survive: '（坚守成功）', objective: '（目标达成）', turnLimit: '（回合上限）' }[st.endReason] || '';
    if (hot) { title = `${w.name} 获胜！`; sub = `本局进行了 ${st.round} 回合${reason}`; art = 'laugh'; }
    else { title = won ? (UI.mode === 'pve' ? '关卡胜利！' : '奶国属于你！') : '奶蛙暂时败退'; sub = `本局进行了 ${st.round} 回合${reason}`; art = won ? 'laugh' : 'sleeper'; }
    const stats = [['造成伤害', me.stats.dmg], ['招募', me.stats.bought], ['联动', me.stats.allies], ['击碎雕塑', me.stats.broke], ['删牌', me.stats.trashed], ['单回合最高奶之力', me.stats.maxPower]];
    const lv = UI.opts.level;
    const next = UI.mode === 'pve' && won ? NW.Campaign.LEVELS[NW.Campaign.LEVELS.findIndex(l => l.id === lv.id) + 1] : null;
    S.modal(`<div class="result"><img src="${NW.UI.artSrc(art)}" style="height:150px;filter:drop-shadow(0 10px 14px #000a)${won || hot ? '' : ';filter:grayscale(.5) drop-shadow(0 10px 14px #000a)'}">
      <div class="eyebrow">对局结束</div><h2>${esc(title)}</h2><p>${esc(sub)}</p>${starsHTML}
      <div class="stats">${stats.map(([k, n]) => `<span>${k} <b>${n}</b></span>`).join('')}</div>
      <div class="row-btns">
        ${won && lv && lv.id === '3-2' ? `<button class="btn big gold" data-story="prologue" data-then="act2">奶国之战 · 序章 ▶</button>` : won && lv && lv.id === 'W8' ? `<button class="btn big gold" data-story="epilogue" data-then="act2">终章 ▶</button>` : next ? `<button class="btn big gold" data-start-level="${next.id}" data-brief="1">下一关：${esc(next.title)}</button>` : ''}
        ${UI.mode !== 'online' ? '<button class="btn big ' + (next ? 'ghost' : 'gold') + '" data-rematch>再来一局</button>' : ''}
        <button class="btn big ghost" data-replay-copy>复制对局记录</button>
        <button class="btn big ghost" data-go="${UI.mode === 'pve' ? 'campaign' : 'menu'}">返回${UI.mode === 'pve' ? '远征' : '菜单'}</button>
      </div></div>`, 'narrow');
  };

  /* ---------- 规则 ---------- */
  S.rules = () => {
    const f = NW.UI.fmt;
    S.modal(`<div class="eyebrow">HOW TO PLAY</div><h2>玩法说明</h2>
      <p>双方各有 <b>30 点生命</b>。每回合开始抽 5 张牌，打出手牌获得资源，在公共市场招募新伙伴，把对手的生命打到 0 即获胜。抽牌堆用完时，弃牌堆洗回成为新的抽牌堆。</p>
      <h3>三种资源（只在本回合有效）</h3>
      <p class="rich-text">${f('{c} 奶蛋')}：购买市场的牌，买到的牌进入弃牌堆。<br>${f('{e} 奶劲')}：每消耗 1 点额外抽 1 张（点击牌库或奶劲）。<br>${f('{p} 奶之力')}：拖到对手头像或雕塑上攻击。攻击本体会用掉全部奶之力；击碎雕塑需一次性付出等于其耐久的奶之力。</p>
      <h3>三种卡牌</h3>
      <p><b>角色</b>立即生效；<b>状态</b>只在本回合生效；<b>雕塑</b>留在场上，从你的下个回合开始持续触发，每人最多 3 座。带<b>嘲讽</b>的雕塑在场时，对手必须先击碎它才能攻击你。被击碎或替换的雕塑进入原主人的弃牌堆。</p>
      <h3>四个阵营与联动</h3>
      <p>${Object.entries(FACTIONS).filter(([k]) => k !== 'neutral').map(([k, x]) => `<span class="tag" style="border-color:${x.color};color:${x.color}">${x.name} · ${x.desc}</span>`).join(' ')}</p>
      <p><b>联动</b>：本回合你打出了另一张同阵营的牌，或你场上有同阵营的雕塑时，该牌的联动效果自动触发（每张牌每回合一次）。少数雕塑（奶羊）也有联动：你打出同阵营的牌时触发，每回合一次。手牌上的「联动就绪」提示表示现在打出就会触发。</p>
      <h3>状态牌</h3>
      <p>状态牌打出后进入出牌区，按类型生效：<br><b>增益</b>（狂笑、哈家军、西格奶、奶门的世界）：本回合有效，强化之后打出的牌，所以先打状态、再打角色（「全部打出」会自动这样排序）。<br><b>守势</b>（惊鸿一瞥、我再也不会笑了）：效果持续到你下个回合开始，在对手的回合保护你，头像旁会显示紫色的守势标记，对手也看得到。<br><b>蓄势</b>（憋笑）：本回合没用完的奶之力留到下回合，并且下回合破壳。<br><b>破壳</b>：攻击对手本体时伤害不会被奶壳吸收（哈家军联动、憋笑）。西格玛会的奶蛇、奶兔会在你每次打出状态牌时触发。<b>西格奶</b>同时算作角色牌（也会触发哈家军、奶狗等「打出角色牌时」的效果）。</p>
      <h3>奶壳</h3>
      <p class="rich-text">${f('{s} 奶壳')}：躺平派的防御资源。吸收对你本体的伤害，持续到你下个回合开始时消失，不能累积到之后的回合；雕塑不受保护。<b>奶蛋守护者</b>能把对手回合里没用掉的奶壳，在你下回合开始时换成等量奶蛋。</p>
      <h3>献祭与删牌</h3>
      <p><b>献祭</b>：部分牌打出后，可点击出牌区中的「献祭」把它送进删牌区，换取一次性效果。<br><b>删牌机会</b>：奶蛋守护者（联动）、奶门的世界、西格奶，以及<b>精英招募</b>（招募价格 5 及以上的牌）会给你 1 次删牌机会。点击出牌区右侧的「选择要删的牌」，挑一张并确认：可删手牌或弃牌堆中的牌（西格奶还能删抽牌堆），也可以移除市场中价格 ≤ 4 的牌换一张新的。删牌机会在回合结束时失效，不会被误点触发。</p>
      <h3>删牌区</h3>
      <p>每位玩家在桌边都有一个<b>删牌区</b>（你的在右下角，对手的在右上角牌库旁边），本回合删掉和献祭的牌都先放在这里，公开可见。<b>回合结束时删牌区清空</b>，里面的牌永久移出游戏。在那之前，带「取回」效果的牌会给你 1 次<b>取回机会</b>（删牌区出现「取回」角标），回合结束前随时点删牌区，选其中一张<b>放回弃牌堆</b>：<b>根本没有这样的奶蛙</b>（嘴硬帮）可取回任意一张——献祭曾经的王拆掉雕塑后把王取回来，下次还能再拆；<b>思考奶蛙</b>（躺平派）可取回一张费用 ≤ 4 的牌。删牌机会也可以删除出牌区里已经打出的牌。</p>
      <h3>操作</h3>
      <p>拖动手牌到牌桌中央打出（或直接点击）· 按住「奶之力」拖出箭头瞄准 · 点击市场的牌购买 · 右键（手机上长按）任意卡牌查看详情<br>快捷键：<b>空格</b> 全部打出 · <b>E</b> 结束回合 · <b>D</b> 消耗奶劲抽牌 · <b>Esc</b> 取消</p>
      <p>新手建议从「奶国远征」第一章开始，前三关有教官一步步带你操作。</p>
      <h3>设置</h3><p>「出牌确认」默认关闭：点一下就打出 / 购买 / 攻击。开启后，点牌会先弹出卡牌详情和确认按钮，适合怕误触的玩家。</p>
      <div class="row-btns"><button class="btn ghost" data-top="confirm">${NW.UI.settings.confirmTap ? '出牌确认 开' : '出牌确认 关'}</button><button class="btn ghost" data-reset-hints>重新显示新手提示</button></div>`);
  };

  /* ---------- 图鉴 ---------- */
  S.codex = (tab = 'all') => {
    const ids = Object.keys(CARDS);
    const filt = ids.filter(id => tab === 'all' || CARDS[id].faction === tab || (tab === 'statue' && CARDS[id].type === 'statue') || (tab === 'status' && CARDS[id].type === 'status'));
    S.modal(`<div class="eyebrow">CARD COLLECTION</div><h2>卡牌图鉴 · ${ids.length} 种</h2>
      <div class="tabs">${[['all', '全部'], ['neutral', '中立'], ['egg', '躺平派'], ['laugh', '绷不住团'], ['iron', '嘴硬帮'], ['spirit', '西格玛会'], ['status', '状态'], ['statue', '雕塑']].map(([k, n]) => `<button data-codex="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="grid-cards">${filt.map(id => NW.UI.cardHTML(id)).join('')}</div>`);
  };

  S.inspect = id => {
    if (!id || !CARDS[id]) return;
    const c = CARDS[id];
    S.modal(`<div style="display:flex;gap:28px;align-items:flex-start;justify-content:center;flex-wrap:wrap">
      <div style="--cw:250px">${NW.UI.cardHTML(id).replace('class="card', 'style="--cw:250px" class="card')}</div>
      <div style="max-width:420px"><div class="eyebrow">${NW.TYPES[c.type]} · ${FACTIONS[c.faction].name}</div><h2>${esc(c.name)}</h2>
      ${c.flavor ? `<p><i>${esc(c.flavor)}</i></p>` : ''}
      ${c.cost ? `<p>价格：${c.cost} 奶蛋</p>` : '<p>起始牌</p>'}
      ${c.ally ? `<p><b>联动</b>：本回合你已打出另一张${FACTIONS[c.faction].name}的牌，或场上有${FACTIONS[c.faction].name}雕塑时自动触发。</p>` : ''}
      ${c.scrap ? '<p><b>献祭</b>：打出后可在出牌区点击「献祭」，把这张牌送进删牌区并获得效果。</p>' : ''}
      ${JSON.stringify(c.play || []).includes('recall') ? '<p><b>取回</b>：打出后获得 1 次取回机会，删牌区会出现「取回」角标。回合结束前随时点删牌区，从本回合删掉或献祭的牌里选 1 张放回弃牌堆；不用也可以。</p>' : ''}
      ${c.type === 'statue' ? `<p><b>雕塑</b>：耐久 ${c.hp}${c.taunt ? '，嘲讽' : ''}。从你的下个回合开始生效。</p>` : ''}
      </div></div>`);
  };

  S.log = UI => {
    const v = UI.view;
    S.modal(`<div class="eyebrow">BATTLE LOG</div><h2>对局记录</h2><ul class="log-list">${v.log.slice().reverse().map(x => `<li class="${x.s === UI.viewer ? '' : 'op'}"><span>第 ${x.r} 回合</span>${esc(x.text)}</li>`).join('')}</ul>`, 'narrow');
  };

  S.pileViewer = (UI, kind) => {
    const v = UI.view, me = v.seats[UI.viewer], op = v.seats[1 - UI.viewer];
    let ids, title, note;
    if (kind === 'deck') { ids = me.deckList || []; title = `你的抽牌堆 · ${ids.length} 张`; note = '只显示构成，不代表抽牌顺序。'; }
    else if (kind === 'discard') { ids = me.discard.map(u => v.cards[u]); title = `你的弃牌堆 · ${ids.length} 张`; note = '打出的牌在回合结束后进入这里；被击碎或替换的雕塑也会进入这里。'; }
    else if (kind === 'trash') { ids = (me.trash || []).map(u => v.cards[u]); title = `你的删牌区 · ${ids.length} 张`; note = '本回合删掉和献祭的牌。回合结束时清空，里面的牌永久移出游戏；在那之前，「根本没有这样的奶蛙」「思考奶蛙」可以把其中一张放回弃牌堆。'; }
    else if (kind === 'oppTrash') { ids = (op.trash || []).map(u => v.cards[u]); title = `${op.name} 的删牌区 · ${ids.length} 张`; note = '对手本回合删掉和献祭的牌，公开可见。'; }
    else { ids = op.discard.map(u => v.cards[u]); title = `${op.name} 的弃牌堆 · ${ids.length} 张`; note = '对手公开的牌。'; }
    S.modal(`<div class="eyebrow">牌库</div><h2>${esc(title)}</h2><p>${note}</p><div class="grid-cards">${ids.length ? ids.map(id => NW.UI.cardHTML(id)).join('') : '<p>这里暂时没有牌</p>'}</div>`);
  };

  S.picker = (UI, zone) => {
    const pd = UI.view.pending; if (!pd || !pd.options) return;
    const zones = Array.from(new Set(pd.options.map(u => pd.zones[u])));
    zone = zones.includes(zone) ? zone : zones[0];
    const name = { hand: '手牌', deck: '抽牌堆', discard: '弃牌堆', trash: '删牌区' };
    const list = pd.options.filter(u => pd.zones[u] === zone);
    S.modal(`<div class="eyebrow">做出选择</div><h2>${esc(pd.prompt)}</h2>
      <div class="tabs">${zones.map(z => `<button data-pick-zone="${z}" class="${z === zone ? 'on' : ''}">${name[z] || z} · ${pd.options.filter(u => pd.zones[u] === z).length}</button>`).join('')}</div>
      <div class="grid-cards">${list.map(u => NW.UI.cardHTML(UI.view.cards[u], `data-pick="${u}"`)).join('')}</div>
      ${pd.optional ? '<div class="row-btns"><button class="btn ghost" data-pick="skip">跳过</button></div>' : ''}`, 'picker');
  };

  /* 删牌机会：选牌 → 确认，避免误删 */
  S.trashPicker = (UI, zone, sel) => {
    const v = UI.view, me = v.seats[UI.viewer], ops = me.trashOps || [];
    if (!ops.length) return S.close();
    const op = ops[0];
    const name = { hand: '手牌', played: '出牌区', discard: '弃牌堆', deck: '抽牌堆', market: '市场' };
    const zones = op.from.slice(); if (!zones.includes('played')) zones.splice(1, 0, 'played'); if (op.market) zones.push('market');
    zone = zones.includes(zone) ? zone : (zones.includes('hand') && (me.hand || []).length ? 'hand' : zones.includes('discard') && me.discard.length ? 'discard' : zones[0]);
    const list = z => z === 'hand' ? (me.hand || []) : z === 'played' ? me.played : z === 'discard' ? me.discard : z === 'deck' ? (me.deckChoices || []) : v.market.filter(u => u && CARDS[v.cards[u]].cost <= op.market);
    const cards = list(zone);
    S.modal(`<div class="eyebrow">删牌机会 ×${ops.length}</div><h2>选择要删除的牌</h2>
      <p>被删除的牌先进入你的删牌区（右下角），回合结束时永久移出游戏；本回合内可以用「取回」放回弃牌堆。删掉起始的「普通奶娃」能让好牌更常被抽到；也可以移除市场里价格 ≤ ${op.market} 的牌，换一张新的上来。出牌区里已经打出的牌也可以删。删牌机会在回合结束时失效。</p>
      <div class="tabs">${zones.map(z => `<button data-tp-zone="${z}" class="${z === zone ? 'on' : ''}">${name[z]} · ${list(z).length}</button>`).join('')}</div>
      <div class="grid-cards">${cards.length ? cards.map(u => NW.UI.cardHTML(v.cards[u], `data-tp-card="${u}" data-tp-zone-of="${zone}"`).replace('class="card', `class="card${u === sel ? ' tp-sel' : ''}`)).join('') : '<p>这里没有可以删除的牌</p>'}</div>
      <div class="row-btns">${sel ? `<button class="btn big gold" data-tp-confirm="${sel}">确认删除「${esc(CARDS[v.cards[sel]].name)}」</button>` : '<span style="font-size:13px;color:#cfd6be">先点一张牌</span>'}<button class="btn big ghost" data-close>暂不使用</button></div>`, 'picker-trash');
    S._tpZone = zone;
  };

  /* 出牌区叠起来的那一摞：列出来，可以献祭 */
  S.playStack = UI => {
    const v = UI.view, owner = v.seats[v.active], mine = v.active === UI.viewer && UI.isHuman && UI.isHuman(UI.viewer);
    const { stackU } = NW.UI.playSplit(owner);
    if (!stackU.length) return S.close();
    S.modal(`<div class="eyebrow">${esc(owner.name)} · 本回合出牌</div><h2>叠放的 ${stackU.length} 张牌</h2>
      <p>出牌区放不下时，较早打出的牌会叠成一摞。${mine ? '带「献祭」的牌可以在这里献祭。' : ''}</p>
      <div class="grid-cards stack-list">${stackU.map(u => { const c = CARDS[v.cards[u]], lit = owner.allyDone && owner.allyDone[u];
        return `<div class="sl-item">${NW.UI.cardHTML(v.cards[u])}${c.ally ? `<small class="${lit ? 'lit' : ''}">${lit ? '已联动' : '未联动'}</small>` : ''}${mine && c.scrap ? `<button class="btn gold" data-stack-scrap="${u}">献祭</button>` : ''}</div>`; }).join('')}</div>
      <div class="row-btns"><button class="btn big ghost" data-close>关闭</button></div>`, 'picker-trash');
  };

  /* 取回机会：点删牌区 → 选牌 → 确认（和删牌机会一样，回合结束前随时可用） */
  S.recallPicker = (UI, sel) => {
    const v = UI.view, me = v.seats[UI.viewer], ops = me.recallOps || [];
    if (!ops.length) return S.close();
    // 每张牌用「刚好够用」的那次机会（费用上限最小的），把宽的留给贵牌
    const opFor = u => { const c = CARDS[v.cards[u]].cost || 0; let best = -1; ops.forEach((o, i) => { if (c <= o.maxCost && (best < 0 || o.maxCost < ops[best].maxCost)) best = i; }); return best; };
    const cards = (me.trash || []).filter(u => opFor(u) >= 0);
    const caps = ops.map(o => o.maxCost >= 99 ? '任意费用' : '费用 ≤ ' + o.maxCost);
    S.modal(`<div class="eyebrow">取回机会 ×${ops.length}（${caps.join('、')}）</div><h2>从删牌区取回 1 张牌</h2>
      <p>选中的牌放回你的弃牌堆，下次洗牌还能抽到。删牌区里是这回合删掉和献祭的牌，回合结束时清空；取回机会也在回合结束时失效，可以先删牌、献祭，再回来取。</p>
      <div class="grid-cards">${cards.length ? cards.map(u => NW.UI.cardHTML(v.cards[u], `data-rc-card="${u}"`).replace('class="card', `class="card${u === sel ? ' tp-sel' : ''}`)).join('') : '<p>删牌区里还没有可以取回的牌。先删牌或献祭，再点删牌区。</p>'}</div>
      <div class="row-btns">${sel ? `<button class="btn big gold" data-rc-confirm="${sel}" data-rc-op="${opFor(sel)}">确认取回「${esc(CARDS[v.cards[sel]].name)}」</button>` : (cards.length ? '<span style="font-size:13px;color:#cfd6be">先点一张牌</span>' : '')}<button class="btn big ghost" data-close>${cards.length ? '暂不使用' : '知道了'}</button></div>`, 'picker-trash');
  };

  S.rtcUi = {
    status: t => { const el = $('#netStatus'); if (el) el.textContent = t; },
    showCode: (code, kind) => { const el = $('#rtcOut'); if (el) { el.value = code; el.parentNode.style.display = ''; } },
    state: st => { const m = { connecting: '正在连接…', connected: '已连接！', open: '通道已打开，开始对局', failed: '连接失败：网络不支持直接打洞。跨国或公司 / 校园网请改选「Radmin 跨国」：两人都开 Radmin VPN 进同一网络，填上 Radmin 地址后重新交换连接码', disconnected: '连接中断' }; if (m[st]) { S.rtcUi.status(m[st]); if (NW.UI.session) NW.FX.toast(m[st]); } },
  };

  S.emote = (id, mine) => {
    const text = { hi: '你好！', laugh: '哈哈哈哈', nice: '好牌！', think: '让我想想…', oops: '失误了…', gg: '打得好' }[id] || id;
    const b = document.createElement('div'); b.className = 'emote-bubble'; b.textContent = text;
    Object.assign(b.style, mine ? { left: '330px', top: '560px' } : { left: '330px', top: '70px' });
    $('#stage').appendChild(b); setTimeout(() => b.remove(), 2500);
  };

  /* ---------- 菜单按钮与弹窗按钮（委托） ---------- */
  S.bind = () => {
    document.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('[data-close]') || t === $('#overlay')) return S.close();
      const diff = t.closest('[data-diff]'); if (diff) { e.stopPropagation(); S.diff = diff.dataset.diff; S.renderMenu(); return; }
      const go = t.closest('[data-go]');
      if (go) {
        const g = go.dataset.go;
        if (g === 'menu') { NW.UI.stop(); S.renderMenu(); S.show('menu'); }
        else if (g === 'campaign') { NW.UI.stop(); S.renderCampaign(); S.show('campaign'); }
        else if (g === 'lobby') { S.renderLobby(); S.show('lobby'); }
        else if (g === 'codex') S.codex();
        else if (g === 'rules') S.rules();
        else if (g === 'packs') S.packs();
        else if (g === 'saves') S.saves();
        else if (g === 'ai') NW.Main.startAI(S.diff || 'normal');
        return;
      }
      const tab = t.closest('[data-act-tab]'); if (tab) { S.campAct = +tab.dataset.actTab; S.renderCampaign(); return; }
      if (t.closest('[data-story-next]')) return S.storyNext(false);
      if (t.closest('[data-story-skip]')) return S.storyNext(true);
      const sb = t.closest('[data-story]');
      if (sb) {
        const which = sb.dataset.story, then = sb.dataset.then;
        if (which === 'prologue') NW.Campaign.Progress.flag('act2intro', true);
        if (which === 'epilogue') NW.Campaign.Progress.flag('act2outro', true);
        return S.story(which, then === 'act2' ? () => { NW.UI.stop(); S.campAct = 2; S.renderCampaign(); S.show('campaign'); } : null);
      }
      const lv = t.closest('[data-level]'); if (lv) return S.brief(lv.dataset.level);
      const sl = t.closest('[data-start-level]'); if (sl) { if (sl.dataset.brief) return S.brief(sl.dataset.startLevel); return NW.Main.startLevel(sl.dataset.startLevel); }
      const pkb = t.closest('[data-pk]'); if (pkb) { if (pkb.dataset.pk === 'check') readJSONFile('.json,application/json', S.packReport); return; }
      const sv = t.closest('[data-sv]');
      if (sv) {
        const k = sv.dataset.sv, SF = NW.SaveFile;
        if (k === 'export') {
          const blob = new Blob([JSON.stringify(SF.export(), null, 2)], { type: 'application/json' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'naiwa-save.json';
          document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
          NW.FX.toast('已导出 naiwa-save.json（没反应的话用「复制为文本」）', 'good');
        } else if (k === 'import') readJSONFile('.json,application/json', (obj, err) => err ? ($('#svBox').innerHTML = `<div class="pk-report bad"><p>${esc(err)}</p></div>`) : S.saveImportConfirm(obj));
        else if (k === 'copy') {
          const txt = JSON.stringify(SF.export());
          $('#svBox').innerHTML = `<div class="field"><label>存档文本（全选复制，保存到备忘录 / 发给自己）</label><textarea rows="4" readonly>${esc(txt)}</textarea></div>`;
          const ta = $('#svBox textarea'); ta.select();
          try { navigator.clipboard.writeText(txt).then(() => NW.FX.toast('已复制存档文本', 'good'), () => {}); } catch (err) { /* 手动复制 */ }
        } else if (k === 'paste') {
          $('#svBox').innerHTML = `<div class="field"><label>粘贴存档文本</label><textarea rows="4" id="svPaste" placeholder='{"game":"naiwa-realm",…}'></textarea></div><div class="row-btns"><button class="btn gold" data-sv="parse">读取</button></div>`;
        } else if (k === 'parse') {
          let obj = null; try { obj = JSON.parse($('#svPaste').value); } catch (err) { $('#svBox').insertAdjacentHTML('beforeend', '<div class="pk-report bad"><p>不是有效的存档文本</p></div>'); return; }
          S.saveImportConfirm(obj);
        } else if (k === 'apply' && S.pendingSave) {
          const r = SF.import(S.pendingSave); S.pendingSave = null;
          if (r.ok) { S.close(); S.renderMenu(); NW.FX.toast(`存档已导入：★ ${r.summary.stars}`, 'good'); }
        }
        return;
      }
      if (t.closest('[data-reset-hints]')) { NW.Coach.resetHints(); NW.FX.toast('新手提示已重置', 'good'); return; }
      if (t.closest('[data-rematch]')) return NW.Main.rematch();
      if (t.closest('[data-replay-copy]')) { const data = JSON.stringify(NW.UI.session.save()); try { navigator.clipboard.writeText(data).then(() => NW.FX.toast('已复制：初始参数 + 动作序列，可用 engine.replay 复原', 'good')); } catch (err) { NW.FX.toast('复制失败', 'bad'); } return; }
      const cx = t.closest('[data-codex]'); if (cx) return S.codex(cx.dataset.codex);
      const pz = t.closest('[data-pick-zone]'); if (pz) return S.picker(NW.UI, pz.dataset.pickZone);
      const tz = t.closest('[data-tp-zone]'); if (tz) return S.trashPicker(NW.UI, tz.dataset.tpZone);
      const tc = t.closest('[data-tp-card]'); if (tc) return S.trashPicker(NW.UI, S._tpZone, tc.dataset.tpCard);
      const ssb = t.closest('[data-stack-scrap]'); if (ssb) { S.close(); NW.UI.submit({ type: 'scrap', uid: ssb.dataset.stackScrap }); return; }
      const rcc = t.closest('[data-rc-card]'); if (rcc) return S.recallPicker(NW.UI, rcc.dataset.rcCard);
      const rcf = t.closest('[data-rc-confirm]'); if (rcf) { S.close(); NW.UI.submit({ type: 'useRecall', op: +rcf.dataset.rcOp, value: rcf.dataset.rcConfirm }); return; }
      const tf = t.closest('[data-tp-confirm]'); if (tf) { S.close(); NW.UI.submit({ type: 'useTrash', op: 0, value: tf.dataset.tpConfirm }); return; }
      const pk = t.closest('[data-pick]'); if (pk) { S.close(); NW.UI.submit({ type: 'choose', value: pk.dataset.pick }); return; }
      if (t.closest('[data-hotseat]')) return NW.Main.startHotseat($('#hsA').value.trim() || '玩家一', $('#hsB').value.trim() || '玩家二');
      const net = t.closest('[data-net]');
      if (net) {
        const mode = $('#netKind').value, vip = mode === 'radmin' ? $('#netVip').value.trim() : '';
        const o = { name: $('#netName').value.trim() || '奶蛙', kind: mode === 'bc' ? 'bc' : 'rtc', room: $('#netRoom').value.trim() || '1', virtualIp: vip };
        S.resetNet();
        if (o.kind !== 'rtc') return NW.Main.startOnline(net.dataset.net, o);
        if (mode === 'radmin' && !NW.Net.IPV4.test(vip)) return S.rtcUi.status(vip ? 'Radmin 地址格式不对，应该像 26.12.34.56（在 Radmin 窗口里自己名字旁边）' : '请先填上你的 Radmin 地址（Radmin 窗口里自己名字旁边的 26.x.x.x）');
        S.vip(vip);
        S.rtcRole = net.dataset.net; S.rtcOpts = o; S.rtcStep = net.dataset.net === 'host' ? 'host-wait-answer' : 'guest-wait-offer';
        $('#rtcBox').style.display = ''; $('#rtcOut').value = ''; $('#rtcIn').value = '';
        setTimeout(() => { const pn = $('#rtcBox').closest('.panel'); if (pn) pn.scrollTop = pn.scrollHeight; }, 60);
        $('#rtcOutLabel').parentNode.style.display = net.dataset.net === 'host' ? '' : 'none';
        $('#rtcInLabel').textContent = net.dataset.net === 'host' ? '第 2 步：粘贴对方发回的回应码' : '第 1 步：粘贴房主发来的邀请码';
        $('#rtcOutLabel').textContent = net.dataset.net === 'host' ? '第 1 步：复制邀请码发给对方' : '第 2 步：复制回应码发回房主';
        if (net.dataset.net === 'host') NW.Main.rtcHost(o, S.rtcUi);
        else S.rtcUi.status('请粘贴房主发来的邀请码');
        return;
      }
      const rb = t.closest('[data-rtc]');
      if (rb) {
        if (rb.dataset.rtc === 'copy') { const v = $('#rtcOut').value; if (!v) return; try { navigator.clipboard.writeText(v).then(() => NW.FX.toast('已复制连接码', 'good'), () => { $('#rtcOut').select(); }); } catch (err) { $('#rtcOut').select(); } return; }
        const code = $('#rtcIn').value.trim(); if (!code) return S.rtcUi.status('先粘贴连接码');
        if (S.rtcRole === 'host') NW.Main.rtcHostFinish(code, S.rtcOpts, S.rtcUi);
        else { NW.Main.rtcGuest(code, S.rtcOpts, S.rtcUi); $('#rtcInField').style.display = 'none'; $('#rtcOutLabel').parentNode.style.display = ''; }
        return;
      }
      const tb = t.closest('[data-top]');
      if (tb) {
        const k = tb.dataset.top;
        if (k === 'menu') { S.menu(); return; }
        if (k === 'mission') { if (NW.UI.opts && NW.UI.opts.level) S.brief(NW.UI.opts.level.id, true); } else if (k === 'rules') S.rules(); else if (k === 'codex') S.codex(); else if (k === 'log') S.log(NW.UI);
        else if (k === 'sound') { NW.FX.sound = !NW.FX.sound; tb.textContent = NW.FX.sound ? '音效 开' : '音效 关'; tb.classList.toggle('on', NW.FX.sound); }
        else if (k === 'confirm') { const on = !NW.UI.settings.confirmTap; NW.UI.setSetting('confirmTap', on); document.querySelectorAll('[data-top="confirm"]').forEach(b => { b.textContent = on ? '出牌确认 开' : '出牌确认 关'; b.classList.toggle('on', on); }); NW.FX.toast(on ? '已开启：点牌后弹出确认面板，再点「打出 / 购买」' : '已关闭：点一下手牌直接打出，点市场直接购买', 'good'); }
        else if (k === 'speed') { const sp = [1, 1.6, 2.5]; const i = (sp.indexOf(NW.FX.speed) + 1) % sp.length; NW.FX.speed = sp[i]; if (NW.UI.session) NW.UI.session.speed = sp[i]; tb.textContent = `动画 ${['1×', '1.6×', '2.5×'][i]}`; }
        else if (k === 'concede') S.modal(`<div class="result"><h2>认输并结束对局？</h2><div class="row-btns"><button class="btn big gold" data-concede>认输</button><button class="btn big ghost" data-close>继续</button></div></div>`, 'narrow');
        else if (k === 'exit') S.modal(`<div class="result"><h2>退出当前对局？</h2><p>进度不会保存。</p><div class="row-btns"><button class="btn big gold" data-go="${NW.UI.mode === 'pve' ? 'campaign' : 'menu'}">退出</button><button class="btn big ghost" data-close>继续</button></div></div>`, 'narrow');
        return;
      }
      if (t.closest('[data-concede]')) { S.close(); const ui = NW.UI; if (ui.session) { const seat = ui.mode === 'hotseat' ? ui.session.seatToAct : ui.viewer; const c = ui.session.controllers[seat]; if (c && c.offer && c.waiting) c.offer({ type: 'concede', seat }); else NW.FX.toast('请在轮到你时认输'); } }
    });
  };
})(window);
