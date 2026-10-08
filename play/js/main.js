/* 奶蛙领域 · 入口：各模式如何把 引擎 / 控制器 / 界面 组装起来
 *
 *   快速对战   Session([Human, AI])                     viewer=0
 *   远征关卡   Session(Campaign.toMatchOptions, [Human, AI(关卡档位)])
 *   同屏对战   Session([Human, Human])                  交接时切换 viewer
 *   联机对战   LockstepLink(Transport) → Session([Human, Remote]) viewer=mySeat
 */
(function (root) {
  'use strict';
  const NW = root.NW = root.NW || {};
  const { Session, HumanController, AIController } = NW.Net;
  const q0 = new URLSearchParams(location.search);
  const seed = () => q0.get('seed') ? +q0.get('seed') : Math.floor(Math.random() * 2 ** 31); // ?seed=123 可复现对局
  let last = null; // 用于“再来一局”

  const Main = {
    startAI(diff) {
      last = () => Main.startAI(diff);
      const prof = NW.AI.PROFILES[diff] || NW.AI.PROFILES.normal;
      const options = {
        seed: seed(), first: 0,
        seats: [{ name: '奶蛙指挥官', portrait: 'kungfu' }, { name: '暗影奶蛙', portrait: 'shadowking' }],
        meta: { mode: 'ai', diff },
      };
      const session = new Session({ options, controllers: [new HumanController('你'), new AIController(diff)], speed: NW.FX.speed });
      NW.UI.start({ session, viewer: 0, mode: 'ai', title: `快速对战 · ${prof.label}` });
    },

    startLevel(id) {
      const C = NW.Campaign, level = C.LEVELS.find(l => l.id === id);
      if (!level) return;
      last = () => Main.startLevel(id);
      const options = C.toMatchOptions(level, seed());
      const session = new Session({ options, controllers: [new HumanController('你'), new AIController(C.aiProfile(level.enemy.ai))], speed: NW.FX.speed });
      NW.UI.start({ session, viewer: 0, mode: 'pve', title: `${level.chapter === 4 ? '奶国之战' : '远征'} ${C.label(level)} · ${level.title}`, level });
    },

    startHotseat(a, b) {
      last = () => Main.startHotseat(a, b);
      const options = {
        seed: seed(), first: 0, rules: { firstHand: 3 },
        seats: [{ name: a, portrait: 'kungfu' }, { name: b, portrait: 'cat' }],
        meta: { mode: 'hotseat' },
      };
      const session = new Session({ options, controllers: [new HumanController(a), new HumanController(b)], speed: NW.FX.speed });
      NW.UI.start({ session, viewer: 0, mode: 'hotseat', title: '同屏对战' });
    },

    startOnline(role, o, prebuilt) {
      const status = t => { const el = document.getElementById('netStatus'); if (el) el.textContent = t; if (NW.UI.session) NW.FX.toast(t); };
      let transport = prebuilt;
      try {
        if (!transport) transport = o.kind === 'ws' ? new NW.Net.WebSocketTransport(o.url, o.room) : new NW.Net.BroadcastTransport(o.room);
      } catch (e) { status('无法建立连接：' + e.message); return; }
      if (Main.link) Main.link.close();
      const link = Main.link = new NW.Net.LockstepLink(transport, {
        role, name: o.name,
        buildOptions: (hostName, guestName, hostSeat) => ({
          seed: seed(), first: 0, rules: { firstHand: 3 },
          seats: hostSeat === 0 ? [{ name: hostName, portrait: 'kungfu' }, { name: guestName, portrait: 'cat' }] : [{ name: guestName, portrait: 'kungfu' }, { name: hostName, portrait: 'cat' }],
          meta: { mode: 'online', room: o.room },
        }),
        onReady: (options, mySeat, remote) => {
          const ctrls = []; ctrls[mySeat] = new HumanController(o.name); ctrls[1 - mySeat] = remote;
          const session = new Session({ options, controllers: ctrls, speed: NW.FX.speed, onAction: a => link.afterAction(session, a) });
          NW.UI.start({ session, viewer: mySeat, mode: 'online', title: `联机 · 房间 ${o.room}`, link });
        },
        onPeer: m => { if (m.t === 'emote') NW.Screens.emote(m.id, false); },
        onStatus: status,
      });
    },

    /* WebRTC 直连：房主 / 客人两步交换连接码 */
    async rtcHost(o, ui) {
      if (typeof RTCPeerConnection === 'undefined') return ui.status('当前环境不支持 WebRTC（在 Claude 内预览时不可用，请用浏览器打开游戏）');
      const t = new NW.Net.RTCTransport({ onState: s => Main.rtc === t && ui.state(s), virtualIp: o.virtualIp });
      Main.rtc = t; ui.status('正在生成邀请码…（最多约 5 秒）');
      try { const code = await t.createOffer(); if (Main.rtc !== t) return; ui.showCode(code, 'offer'); ui.status('把邀请码发给对方，再把对方回给你的回应码粘贴到下面'); }
      catch (e) { if (Main.rtc === t) ui.status('生成失败：' + e.message); }
    },
    async rtcHostFinish(code, o, ui) {
      try { await Main.rtc.acceptAnswer(code); ui.status('正在连接…'); Main.startOnline('host', o, Main.rtc); }
      catch (e) { ui.status('回应码无效：' + e.message); }
    },
    async rtcGuest(code, o, ui) {
      if (typeof RTCPeerConnection === 'undefined') return ui.status('当前环境不支持 WebRTC（在 Claude 内预览时不可用，请用浏览器打开游戏）');
      const t = new NW.Net.RTCTransport({ onState: s => Main.rtc === t && ui.state(s), virtualIp: o.virtualIp });
      Main.rtc = t; ui.status('正在生成回应码…（最多约 5 秒）');
      try { const ans = await t.acceptOffer(code); if (Main.rtc !== t) return; ui.showCode(ans, 'answer'); ui.status('把回应码发回给房主，对方粘贴后自动开始'); Main.startOnline('guest', o, t); }
      catch (e) { if (Main.rtc === t) ui.status('邀请码无效：' + e.message); }
    },
    /** 切换连接方式 / 重新创建房间前：关掉还没连上的直连 */
    resetRtc() { if (Main.rtc) { const t = Main.rtc; Main.rtc = null; if (!(Main.link && Main.link.t === t)) t.close(); } },
    rematch() { NW.Screens.close(); if (last) last(); },
  };
  NW.Main = Main;

  function boot() {
    NW.UI.fitStage();
    window.addEventListener('resize', NW.UI.fitStage);
    window.addEventListener('orientationchange', () => setTimeout(NW.UI.fitStage, 250));
    // 牌桌自己会缩放，禁止浏览器的双指缩放（iOS Safari 不认 user-scalable=no，要拦手势；双击放大由 CSS touch-action 关掉）
    document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
    document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    NW.UI.bind(); NW.UI.bindRail(); NW.Screens.bind(); NW.FX.preloadVoices(['laugh', 'egg']);
    NW.Screens.renderMenu(); NW.Screens.show('menu');
    document.querySelectorAll('[data-top="confirm"]').forEach(b => { const on = NW.UI.settings.confirmTap; b.textContent = on ? '出牌确认 开' : '出牌确认 关'; b.classList.toggle('on', on); });
    // 预加载图片
    Object.values(NW.CARDS).forEach(c => { const i = new Image(); i.src = NW.UI.artSrc(c.art, c.artMode === 'photo'); });
    // 调试 / 自动化入口：?mode=ai|pve|hotseat&level=1-1
    const q = new URLSearchParams(location.search);
    if (q.get('speed')) NW.FX.speed = +q.get('speed');
    if (q.get('mode') === 'ai') Main.startAI(q.get('diff') || 'normal');
    if (q.get('mode') === 'pve') Main.startLevel(q.get('level') || '1-1');
    if (q.get('mode') === 'hotseat') Main.startHotseat('玩家一', '玩家二');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
