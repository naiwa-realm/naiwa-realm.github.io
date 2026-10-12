/* 奶蛙领域 · 小游戏入口（奶蛙·推界）
 * 小游戏是一个独立页面 minigames/pushrealm.html，放在 iframe 里运行，和卡牌对局的状态完全隔离。
 * 网站版按需加载这个页面；离线单文件版由 build_single.py 把页面内联成 NW.PUSH_SRC，用 srcdoc 打开。
 */
(function () {
  'use strict';
  const app = window.NW = window.NW || {};
  const layer = document.getElementById('pushrealm-portal');
  const frame = document.getElementById('pushrealm-frame');
  const back = document.getElementById('pushrealm-return');
  const mobileHub = document.getElementById('pushrealm-mobile-hub');
  if (!layer || !frame) return;
  const thumb = () => app.UI && app.UI.artSrc ? app.UI.artSrc('pushrealm_thumb') : 'assets/art/pushrealm_thumb.webp';
  const preview = document.getElementById('mobile-hub-preview');
  if (preview) preview.src = thumb();
  let previousFocus = null;

  function showMobileHub() { if (window.innerWidth <= 700) { mobileHub.classList.add('active'); mobileHub.setAttribute('aria-hidden', 'false'); } }
  function hideMobileHub() { mobileHub.classList.remove('active'); mobileHub.setAttribute('aria-hidden', 'true'); }
  function open() {
    previousFocus = document.activeElement;
    layer.classList.add('active'); layer.setAttribute('aria-hidden', 'false');
    if (app.PUSH_SRC) frame.srcdoc = app.PUSH_SRC; else frame.src = 'minigames/pushrealm.html';
    back.focus();
  }
  function close() {
    layer.classList.remove('active'); layer.setAttribute('aria-hidden', 'true');
    frame.removeAttribute('srcdoc'); frame.src = 'about:blank';
    if (previousFocus && previousFocus.focus) previousFocus.focus();
  }
  document.getElementById('mobile-hub-play').addEventListener('click', open);
  document.getElementById('mobile-hub-return').addEventListener('click', () => { hideMobileHub(); app.Screens.renderMenu(); app.Screens.show('menu'); });
  back.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && layer.classList.contains('active') && document.activeElement !== frame) { e.preventDefault(); close(); } });
  // 离开小游戏大厅（返回主菜单等）时收起手机版大厅
  document.addEventListener('click', e => { const g = e.target.closest && e.target.closest('[data-go]'); if (g && g.dataset.go !== 'minigames' && g.dataset.go !== 'pushrealm') hideMobileHub(); }, true);
  app.PushMini = { open, close, showMobileHub, hideMobileHub, get thumb() { return thumb(); } };
})();
