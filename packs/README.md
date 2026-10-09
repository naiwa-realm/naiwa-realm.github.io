# 奶蛙领域 · 扩展包

> **状态：格式草案（format 1）。** 游戏 v8.3 已经可以导入扩展包 JSON 做格式检查，但还不会安装。扩展包 v1（安装、启用、管理）开放后，这份说明会补全成正式的作者指南，并附一个示范扩展包。字段在 v1 正式发布前可能还会调整。

## 目录结构

```
packs/
├── index.json        ← 网站上的扩展包目录，游戏「扩展包」页面读取它
├── official/         ← 官方扩展包
└── community/        ← 社区投稿
    └── <包id>/
        ├── manifest.json
        ├── README.md
        └── art/      ← 卡图（webp / png / jpg）
```

## manifest.json 示例

```json
{
  "format": 1,
  "id": "dragon-empire",
  "name": "奶龙帝国",
  "author": "Alice",
  "version": "1.0.0",
  "description": "一句话介绍",
  "game": { "min": "8.3" },

  "cards": [
    {
      "id": "dragon_king",
      "name": "奶龙王",
      "type": "char",
      "faction": "egg",
      "cost": 5,
      "art": "art/dragon_king.webp",
      "play": [{ "gain": "coin", "n": 2 }, { "gain": "power", "n": 3 }],
      "ally": [{ "draw": 1 }],
      "text": { "play": "+2{c} +3{p}", "ally": "抽 1 张" },
      "flavor": "奶龙一怒，奶国震三震。"
    }
  ],

  "pool": { "dragon_king": 2 }
}
```

## 顶层字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `format` | 是 | 扩展包格式版本，现在是 `1`。游戏遇到更高的数字会提示「请更新游戏」 |
| `id` | 是 | 小写字母、数字、`-`、`_`，2–40 个字符，全网唯一。不能以 `naiwa` 开头 |
| `name` | 是 | 显示名称 |
| `author` | 建议 | 作者 |
| `version` | 是 | 三段式版本号，例如 `1.0.0`。改了效果就要升版本号 |
| `description` | 否 | 一句话介绍 |
| `game.min` | 否 | 需要的最低游戏版本 |
| `cards` | 是 | 卡牌列表 |
| `pool` | 否 | `{ "卡牌id": 张数 }`，决定哪些牌进入市场牌池、各几张（0–6）。可以引用本体的牌来调整张数 |

`levels`（自定义关卡）和 `scripts`（脚本）会在以后的格式里开放；format 1 里 `levels` 被忽略，`scripts` 视为错误。

## 卡牌字段

和游戏本体 `play/js/cards.js` 用的是同一套结构。

| 字段 | 说明 |
|---|---|
| `id` | 包内唯一。游戏内部会叫它 `包id/卡牌id`，不会和别的包冲突 |
| `name` | 卡名 |
| `type` | `char` 角色 / `status` 状态 / `statue` 雕塑 |
| `faction` | `egg` 躺平派 / `laugh` 绷不住团 / `iron` 嘴硬帮 / `spirit` 西格玛会 / `neutral` 中立 |
| `cost` | 0–12 |
| `hp` | 雕塑耐久（1–15），只有雕塑需要 |
| `taunt` | 雕塑：`true` 为嘲讽 |
| `kind` | 状态牌：`buff` 增益 / `guard` 守势 / `charge` 蓄势 |
| `guard` | 守势效果：`{ "cap": 6 }` 每回合最多失去 6 点生命，或 `{ "thorns": 3 }` 反伤 3 |
| `passive` | 状态牌被动：`frenzy` `sigma` `army` `gate` `hold`（含义见游戏内图鉴） |
| `play` | 打出时的效果列表 |
| `ally` | 联动效果（本回合打出过同阵营的牌，或场上有同阵营雕塑）。雕塑也可以有联动 |
| `alsoChar` | 状态牌：`true` 时同时算作角色牌 |
| `scrap` | 献祭效果（打出后可以移出游戏换取） |
| `turnStart` | 雕塑：你的回合开始时 |
| `onChar` / `onStatus` | 雕塑：你每打出一张角色 / 状态牌时 |
| `art` | 卡图在包内的路径 |
| `text` | 卡面文字：`{ "play": "...", "ally": "...", "scrap": "..." }`。记号：`{c}` 奶蛋 `{e}` 奶劲 `{p}` 奶之力 `{s}` 奶壳 |
| `flavor` | 风味文字 |

## 效果原语

效果列表里每一项是一个对象，按顺序执行：

| 写法 | 效果 |
|---|---|
| `{ "gain": "coin", "n": 2 }` | 获得资源：`coin` 奶蛋 / `energy` 奶劲 / `power` 奶之力 |
| `{ "draw": 1 }` | 抽牌 |
| `{ "shield": 3 }` | 获得奶壳（持续到你下个回合开始） |
| `{ "oppDiscard": 1 }` | 对手下回合开始时弃牌 |
| `{ "pierce": true }` | 破壳：本回合攻击无视奶壳 |
| `{ "shieldBank": true }` | 对手回合结束后没用掉的奶壳，在你下回合开始时变成等量奶蛋 |
| `{ "topdeckNext": true }` | 本回合下一张购入的牌放到牌库顶 |
| `{ "trash": { "from": ["hand", "discard"] } }` | 获得 1 次删牌机会 |
| `{ "sigmaTrash": true }` | 获得 1 次删牌机会，可以删抽牌堆里的牌 |
| `{ "destroyStatue": { "maxHp": 5 } }` | 击碎对手一座耐久不超过 5 的雕塑 |
| `{ "discardSelf": 1 }` | 自己弃牌 |
| `{ "recall": { "to": "discard", "maxCost": 4 } }` | 获得 1 次取回机会（回合结束前点删牌区使用），从本回合删牌区取回 1 张牌：`to` 为 `discard` 弃牌堆（默认）/ `top` 牌库顶 / `hand` 手牌；`maxCost` 可选，限制费用 |
| `{ "if": "hasStatue", "then": [...], "else": [...] }` | 条件：`hasStatue` `otherStatue` `hasEnergy` `charsInHand2` |
| `{ "once": "名字", "then": [...] }` | 每回合限一次 |

需要玩家做选择的效果（击碎、弃牌）放在列表最后；删牌机会和取回机会由玩家在回合内自己决定何时使用。

**删牌区**：每位玩家桌边都有一个公开的删牌区。删掉的牌、献祭的牌都进入这里，不再参与洗牌，只有 `recall` 能拿回来。

## 指纹与联机

游戏会把「影响规则的内容」（引擎版本、卡牌效果、牌池、启用的扩展包）算成一串指纹，显示在主菜单右下角。卡名、文字、卡图不算在内。

联机时双方先比对指纹：v8.3 起不一致会直接提示。扩展包 v1 之后，会显示对方启用了哪些扩展包，并且可以把缺的包直接传给对方。

## 投稿（v1 开放后）

1. Fork 本仓库。
2. 在 `packs/community/<你的包id>/` 放 `manifest.json`、`README.md` 和卡图。
3. 在 `packs/index.json` 的 `packs` 里加一条。
4. 发 Pull Request。

现在就可以在游戏里「扩展包 → 导入并检查扩展包」，先检查格式。
