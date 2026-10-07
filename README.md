# 奶蛙领域 · THE MILK REALM

奶蛙梗 × 牌库构筑对战。四大阵营、状态牌连招、两部远征关卡、三档电脑对手和免服务器联机，打开浏览器就能玩。

**▶ 在线游玩：** 打开本仓库的 GitHub Pages 地址（仓库首页右侧 About → 网址），点「立即游玩」。
**⬇ 离线版：** [Releases](../../releases/latest) 里下载 `naiwa-realm-v*.html`，双击用浏览器打开。

免费 · 开源 · 开发中。

## 目录

```
index.html          主页
play/               网页版游戏
  index.html
  css/table.css
  js/cards.js       卡牌数据（纯数据，效果原语）
  js/engine.js      规则引擎：纯 JSON 状态、确定性随机、回放
  js/ai.js          电脑对手
  js/levels.js      远征关卡、关卡规则、星级、存档
  js/packs.js       扩展包入口：格式检查、内容指纹、存档导出 / 导入
  js/net.js         会话、锁步联机、WebRTC 直连
  js/fx.js  js/ui.js  js/screens.js  js/coach.js  js/main.js
  assets/art/       美术
packs/              扩展包目录与格式说明（草案）
assets/             主页用的封面、截图
CHANGELOG.md        更新日志
```

## 本地运行

```bash
python3 -m http.server 8000      # 然后打开 http://localhost:8000
```

直接双击 `play/index.html` 也能玩，但「扩展包」页面读不到社区目录。

## 存档

进度保存在浏览器的 localStorage 里。主菜单「存档」可以导出 / 导入 `naiwa-save.json`。

## 扩展包

见 [packs/README.md](packs/README.md)。

## 说明

非商业的粉丝作品。奶蛙等形象来自网络梗图，版权归原作者所有。
