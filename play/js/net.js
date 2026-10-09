/* 奶蛙领域 · 对局会话、控制器与联机传输层
 *
 *   Session            拥有引擎状态，轮流向两个座位的控制器要动作，执行后通知表现层。
 *   Controller 接口     { kind, decide(session, seat) → Promise<Action>, cancel?() }
 *     - HumanController   由界面调用 session.submit(action) 提交
 *     - AIController      本地电脑（NW.AI）
 *     - RemoteController  来自网络的对手（锁步联机）
 *   Transport 接口      { send(msg), onMessage(fn), close(), id }
 *     - LoopbackTransport.pair()   同进程两端（测试 / 观战）
 *     - BroadcastTransport(room)   同一浏览器的两个标签页（本地联机测试）
 *     - WebSocketTransport(url)    配合 server/pvp-server.mjs（校验型中继服务器；界面暂不提供，留给以后的公网中转）
 *     - RTCTransport()             WebRTC 点对点直连，交换两次连接码即可，不需要游戏服务器
 *   LockstepLink        把 Session 与 Transport 接起来：开局握手、动作广播、校验和比对、表情、认输。
 *
 * 锁步协议（JSON 消息）：
 *   {t:'hello', name, ver}                    加入房间
 *   {t:'start', options, seats:{host, guest}} 房主下发开局参数（含种子），双方据此 createMatch
 *   {t:'action', n, action, hash}             第 n 个动作及执行后的状态校验和
 *   {t:'desync', n, hash}                     校验和不一致
 *   {t:'emote', seat, id}                     快捷表情
 *   {t:'reject', n, error}                    服务器拒绝了非法动作（仅服务器发送）
 *   {t:'bye'}                                 离开
 */
(function (root) {
  'use strict';
  const NW = root.NW = root.NW || {};
  const E = () => NW.engine;
  const PROTOCOL = 1;

  /* ---------------- 控制器 ---------------- */
  class HumanController {
    constructor(name) { this.kind = 'human'; this.name = name; this._resolve = null; }
    decide(session, seat) {
      const p = new Promise(res => { this._resolve = res; this.seat = seat; });
      if (this.onWait) setTimeout(() => this.onWait(seat), 0); // 界面可在此刷新排队的点击
      return p;
    }
    get waiting() { return !!this._resolve; }
    offer(action) { if (!this._resolve) return false; const r = this._resolve; this._resolve = null; r(action); return true; }
    cancel() { this._resolve = null; }
  }

  class AIController {
    constructor(profile, opts = {}) { this.kind = 'ai'; this.profile = profile; this.speed = opts.speed || 1; this._stop = false; }
    async decide(session, seat) {
      const prof = typeof this.profile === 'string' ? NW.AI.PROFILES[this.profile] : this.profile;
      const think = (prof && prof.think) || 420;
      await wait(think / (session.speed || 1));
      if (this._stop) return new Promise(() => {});
      let a = NW.AI.decide(session.state, seat, this.profile);
      if (!a || E().check(session.state, a)) a = session.state.pending ? { type: 'choose', seat, value: 'skip' } : { type: 'endTurn', seat };
      return a;
    }
    cancel() { this._stop = true; }
  }

  class RemoteController {
    constructor(link) { this.kind = 'remote'; this.link = link; this.queue = []; this._resolve = null; }
    push(action) { if (this._resolve) { const r = this._resolve; this._resolve = null; r(action); } else this.queue.push(action); }
    decide() { return this.queue.length ? Promise.resolve(this.queue.shift()) : new Promise(res => { this._resolve = res; }); }
    cancel() { this._resolve = null; }
  }

  /* ---------------- 会话 ---------------- */
  class Session {
    /**
     * @param {object} o
     *   options      engine.createMatch 的参数
     *   controllers  [ctrl0, ctrl1]
     *   onUpdate     async (events, action, session) => {}  表现层动画，返回 Promise 时会等待
     *   onError      (error, action) => {}
     *   onAction     (action, result) => {}                  每个成功动作后（联机广播用）
     */
    constructor(o) {
      this.options = o.options; this.controllers = o.controllers;
      this.onUpdate = o.onUpdate || (() => {}); this.onError = o.onError || (() => {}); this.onAction = o.onAction || (() => {});
      this.state = E().createMatch(o.options);
      this.history = []; this.stopped = false; this.speed = o.speed || 1; this.busy = false;
    }
    get seatToAct() { return this.state.pending ? this.state.pending.seat : this.state.active; }
    view(seat) { return E().view(this.state, seat); }
    check(action) { return E().check(this.state, action); }
    /** 界面提交动作：仅当该座位是本地人类且轮到他时生效 */
    submit(action) {
      const c = this.controllers[action.seat];
      if (!(c instanceof HumanController)) return '不是本地玩家';
      const err = this.check(action); if (err) return err;
      if (this.busy || !c.waiting) return '请稍候';
      c.offer(action); return null;
    }
    async run() {
      await this.onUpdate([{ t: 'matchStart' }], null, this);
      while (!this.state.over && !this.stopped) {
        const seat = this.seatToAct, ctrl = this.controllers[seat];
        const action = await ctrl.decide(this, seat);
        if (this.stopped) return;
        if (!action) continue;
        action.seat = action.seat == null ? seat : action.seat;
        const res = E().apply(this.state, action);
        if (!res.ok) { this.onError(res.error, action); continue; }
        this.history.push(action);
        this.onAction(action, res);
        this.busy = true;
        // 动画出错不能让对局卡死：记下错误，继续下一步
        try { await this.onUpdate(res.events, action, this); } catch (e) { console.error(e); } finally { this.busy = false; }
      }
    }
    stop() { this.stopped = true; this.controllers.forEach(c => c.cancel && c.cancel()); }
    /** 存档：初始参数 + 动作序列（可用 engine.replay 复原） */
    save() { return { v: PROTOCOL, options: this.options, actions: this.history }; }
  }

  /* ---------------- 传输层 ---------------- */
  let tid = 0;
  class LoopbackTransport {
    static pair() { const a = new LoopbackTransport(), b = new LoopbackTransport(); a.peer = b; b.peer = a; return [a, b]; }
    constructor() { this.id = 'loop' + (++tid); this.handlers = []; }
    send(msg) { const p = this.peer; setTimeout(() => p.handlers.forEach(h => h(JSON.parse(JSON.stringify(msg)))), 0); }
    onMessage(fn) { this.handlers.push(fn); }
    close() { this.handlers = []; }
  }

  class BroadcastTransport {
    constructor(room) {
      this.id = 'bc' + Math.random().toString(36).slice(2, 8); this.handlers = [];
      this.ch = new BroadcastChannel('naiwa-room-' + room);
      this.ch.onmessage = e => { if (e.data && e.data.from !== this.id) this.handlers.forEach(h => h(e.data.msg)); };
    }
    send(msg) { this.ch.postMessage({ from: this.id, msg }); }
    onMessage(fn) { this.handlers.push(fn); }
    close() { try { this.send({ t: 'bye' }); this.ch.close(); } catch (e) { /* 已关闭 */ } }
  }

  class WebSocketTransport {
    /** url 例：ws://localhost:8787 ；room 为房间号 */
    constructor(url, room) {
      this.id = 'ws' + Math.random().toString(36).slice(2, 8); this.handlers = []; this.openHandlers = []; this.buffer = [];
      this.ws = new WebSocket(url.replace(/\/$/, '') + '/room/' + encodeURIComponent(room));
      this.ws.onopen = () => { this.buffer.forEach(m => this.ws.send(m)); this.buffer = []; this.openHandlers.forEach(h => h()); };
      this.ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } this.handlers.forEach(h => h(m)); };
      this.ws.onclose = () => this.handlers.forEach(h => h({ t: 'bye', reason: 'socket' }));
      this.ws.onerror = () => this.handlers.forEach(h => h({ t: 'error', error: '无法连接服务器' }));
    }
    send(msg) { const s = JSON.stringify(msg); if (this.ws.readyState === 1) this.ws.send(s); else this.buffer.push(s); }
    onMessage(fn) { this.handlers.push(fn); }
    close() { try { this.ws.close(); } catch (e) { /* 已关闭 */ } }
  }

  /* ---------------- WebRTC 点对点（无需游戏服务器） ----------------
   * 双方各交换一次「连接码」：房主生成邀请码 → 客人粘贴后生成回应码 → 房主粘贴回应码 → 直连。
   * 连接码 = 压缩后的 SDP（已包含收集完的 ICE 候选，不需要信令服务器）。
   * 同一局域网 / 同一热点下直接可用；跨网络依赖 STUN 打洞，对称 NAT 下可能失败（无 TURN 中继）。
   */
  const ICE_SERVERS = [
    { urls: 'stun:stun.miwifi.com:3478' }, { urls: 'stun:stun.chat.bilibili.com:3478' },
    { urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' },
  ];
  async function packCode(obj) {
    const json = JSON.stringify(obj);
    try {
      const cs = new CompressionStream('deflate-raw');
      const buf = await new Response(new Blob([json]).stream().pipeThrough(cs)).arrayBuffer();
      let bin = ''; new Uint8Array(buf).forEach(b => { bin += String.fromCharCode(b); });
      return 'NW1' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) { return 'NW0' + btoa(unescape(encodeURIComponent(json))); }
  }
  async function unpackCode(code) {
    code = String(code || '').trim().replace(/\s+/g, '');
    if (code.startsWith('NW0')) return JSON.parse(decodeURIComponent(escape(atob(code.slice(3)))));
    if (!code.startsWith('NW1')) throw new Error('连接码格式不对');
    let b64 = code.slice(3).replace(/-/g, '+').replace(/_/g, '/'); while (b64.length % 4) b64 += '=';
    const bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream('deflate-raw');
    return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text());
  }
  /**
   * 虚拟局域网（Radmin VPN 等）直连：浏览器出于隐私会把本机地址换成 xxx.local，对方无法据此连接。
   * 玩家手动填自己的虚拟地址（如 26.x.x.x），这里给每个本机 UDP 端口各补一条「该地址 + 端口」的候选。
   * 浏览器为每块网卡单独开端口，其中属于虚拟网卡的那一条能连通，其余的对方试一下就放弃。
   * 原有的候选（同一局域网 / STUN 打洞）全部保留，所以填了地址也不影响普通直连。
   */
  const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  function addVirtualCandidates(sdp, ip) {
    if (!ip || !IPV4.test(ip)) return sdp;
    const out = [], seen = new Set(); let k = 0;
    for (const line of sdp.split(/\r?\n/)) {
      if (line === '') continue;
      out.push(line);
      const m = /^a=candidate:\S+ (\d+) udp \d+ \S+ (\d+) typ host/i.exec(line);
      if (m && !seen.has(m[1] + ':' + m[2])) {
        seen.add(m[1] + ':' + m[2]);
        out.push(`a=candidate:26${k++}0 ${m[1]} udp 2113937151 ${ip} ${m[2]} typ host generation 0`);
      }
    }
    return out.join('\r\n') + '\r\n';
  }
  class RTCTransport {
    constructor(opts = {}) {
      this.id = 'rtc' + Math.random().toString(36).slice(2, 8); this.handlers = []; this.buffer = []; this.ch = null;
      this.virtualIp = (opts.virtualIp || '').trim();
      this.onState = opts.onState || (() => {});
      this.pc = new RTCPeerConnection({ iceServers: opts.iceServers || ICE_SERVERS });
      this.pc.onconnectionstatechange = () => {
        const st = this.pc.connectionState; this.onState(st);
        if (st === 'failed' || st === 'closed') this.handlers.forEach(h => h({ t: 'bye', reason: 'rtc-' + st }));
      };
      this.pc.ondatachannel = e => this.bind(e.channel);
    }
    bind(ch) {
      this.ch = ch;
      ch.onopen = () => { this.buffer.forEach(m => ch.send(m)); this.buffer = []; this.onState('open'); };
      ch.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } this.handlers.forEach(h => h(m)); };
    }
    gathered() {
      return new Promise(res => {
        if (this.pc.iceGatheringState === 'complete') return res();
        const done = () => { if (this.pc.iceGatheringState === 'complete') res(); };
        this.pc.addEventListener('icegatheringstatechange', done);
        setTimeout(res, 4000); // 最多等 4 秒，拿到的候选先用着
      });
    }
    /** 房主：生成邀请码 */
    async createOffer() {
      this.bind(this.pc.createDataChannel('naiwa', { ordered: true }));
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await this.gathered();
      return packCode({ k: 'offer', sdp: addVirtualCandidates(this.pc.localDescription.sdp, this.virtualIp) });
    }
    /** 客人：粘贴邀请码，生成回应码 */
    async acceptOffer(code) {
      const o = await unpackCode(code); if (o.k !== 'offer') throw new Error('这不是邀请码');
      await this.pc.setRemoteDescription({ type: 'offer', sdp: o.sdp });
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      await this.gathered();
      return packCode({ k: 'answer', sdp: addVirtualCandidates(this.pc.localDescription.sdp, this.virtualIp) });
    }
    /** 房主：粘贴回应码，完成连接 */
    async acceptAnswer(code) {
      const o = await unpackCode(code); if (o.k !== 'answer') throw new Error('这不是回应码');
      await this.pc.setRemoteDescription({ type: 'answer', sdp: o.sdp });
    }
    send(msg) { const s = JSON.stringify(msg); if (this.ch && this.ch.readyState === 'open') this.ch.send(s); else this.buffer.push(s); }
    onMessage(fn) { this.handlers.push(fn); }
    close() { try { this.send({ t: 'bye' }); this.pc.close(); } catch (e) { /* 已关闭 */ } }
  }

  /* ---------------- 锁步联机 ---------------- */
  /** 握手：带上游戏版本和内容指纹（v8.3 起），旧版本不带也能连 */
  function hello(name, role) {
    const P = NW.Packs;
    return { t: 'hello', name, ver: PROTOCOL, role, gv: NW.VERSION, content: P ? P.fingerprint() : undefined, packs: P ? P.enabled().map(p => p.manifest.id + '@' + p.manifest.version) : [] };
  }

  class LockstepLink {
    /**
     * @param {Transport} transport
     * @param {object} o  { role:'host'|'guest', name, buildOptions:(hostName, guestName)=>options, onReady(session, mySeat), onPeer(msg), onStatus(text) }
     */
    constructor(transport, o) {
      this.t = transport; this.o = o; this.role = o.role; this.started = false; this.mySeat = null; this.remote = null; this.n = 0; this.peerName = null;
      transport.onMessage(m => this.receive(m));
      this.t.send(hello(o.name, this.role));
      this.status(this.role === 'host' ? '已创建房间，等待对手加入…' : '正在加入房间…');
    }
    status(s) { this.o.onStatus && this.o.onStatus(s); }
    receive(m) {
      if (!m || !m.t) return;
      switch (m.t) {
        case 'hello':
          if (m.ver !== PROTOCOL) { this.status('对方版本不一致'); return; }
          if (m.content && NW.Packs && m.content !== NW.Packs.fingerprint()) {
            const P = NW.Packs;
            this.status(`双方游戏内容不一致：你是 v${NW.VERSION} · ${P.short(P.fingerprint())}，对方是 v${m.gv || '?'} · ${P.short(m.content)}。请双方打开同一版本的游戏${m.packs && m.packs.length ? '（对方启用了扩展包：' + m.packs.join('、') + '）' : ''}`);
            if (!this.mismatchSent) { this.mismatchSent = true; this.t.send({ t: 'error', error: `双方游戏内容不一致：你是 v${m.gv || '?'} · ${P.short(m.content)}，对方是 v${NW.VERSION} · ${P.short(P.fingerprint())}。请双方打开同一版本的游戏` }); }
            this.o.onPeer && this.o.onPeer(Object.assign({}, m, { t: 'mismatch' }));
            return;
          }
          this.peerName = m.name;
          if (this.role === 'host' && !this.started) {
            const hostSeat = Math.random() < 0.5 ? 0 : 1; // 随机先后手
            const options = this.o.buildOptions(this.o.name, m.name, hostSeat);
            this.t.send({ t: 'start', options, seats: { host: hostSeat, guest: 1 - hostSeat } });
            this.begin(options, hostSeat);
          } else if (this.role === 'guest' && !this.started) this.t.send(hello(this.o.name, this.role));
          break;
        case 'start':
          if (this.role === 'guest' && !this.started) this.begin(m.options, m.seats.guest);
          break;
        case 'action': {
          if (!this.remote) return;
          this.pendingHash = this.pendingHash || {}; this.pendingHash[m.n] = m.hash;
          this.remote.push(m.action);
          break;
        }
        case 'reject': this.status('服务器拒绝了动作：' + m.error); break;
        case 'desync': this.status('⚠ 双方状态不一致（第 ' + m.n + ' 步）'); break;
        case 'error': this.status(m.error); break;
        case 'bye': this.status('对手已离开'); break;
      }
      this.o.onPeer && this.o.onPeer(m);
    }
    begin(options, mySeat) {
      this.started = true; this.mySeat = mySeat;
      this.remote = new RemoteController(this);
      this.status(`对局开始：你是${mySeat === options.first ? '先手' : '后手'}`);
      this.o.onReady(options, mySeat, this.remote, this);
    }
    /** 每个动作执行后由 Session.onAction 调用 */
    afterAction(session, action) {
      this.n++;
      const h = E().hash(session.state);
      if (action.seat === this.mySeat) this.t.send({ t: 'action', n: this.n, action, hash: h });
      else if (this.pendingHash && this.pendingHash[this.n] && this.pendingHash[this.n] !== h) { this.t.send({ t: 'desync', n: this.n, hash: h }); this.status('⚠ 双方状态不一致（第 ' + this.n + ' 步）'); }
    }
    emote(id) { this.t.send({ t: 'emote', seat: this.mySeat, id }); }
    close() { this.t.close(); }
  }

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  NW.Net = { PROTOCOL, Session, HumanController, AIController, RemoteController, LoopbackTransport, BroadcastTransport, WebSocketTransport, RTCTransport, LockstepLink, packCode, unpackCode, addVirtualCandidates, IPV4, wait };
  if (typeof module !== 'undefined' && module.exports) module.exports = NW;
})(typeof window !== 'undefined' ? window : globalThis);
