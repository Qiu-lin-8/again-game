# 上一局的我想杀我 | Ghosts of Me

> 你最大的敌人，不是别人，而是十秒前的自己。

这是 AI Coding 游戏黑客松的一天制网页游戏项目。当前版本由原始单文件 Demo 模块化重构而来，保留了原有玩法、计分、视觉风格和鼠标/键盘/触屏操作。

## 团队协作

| 角色 | GitHub ID | 开发分支 | 负责范围 |
| --- | --- | --- | --- |
| 成员 A / 集成人 | Qiu-lin-8 | `feature/core` | `src/core/`、`src/main.js` 和公共文件 |
| 成员 B | EternalAurora123 | `feature/ghost` | `src/ghost/` |
| 成员 C | wuli-11 | `feature/ui` | `src/ui/` |

功能完成后创建指向 `main` 的 Pull Request，由另一名成员检查并运行后再合并。详细规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 运行

需要 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run dev
```

终端会显示本地访问地址，通常为 `http://localhost:5173`。

构建可部署静态网页：

```bash
npm run build
```

产物位于 `dist/`。本项目使用 ES Modules，不能再通过双击 `index.html` 的 `file://` 地址运行。

运行逻辑测试：

```bash
npm test
```

## 玩法

- 每关 10 秒，共有 5 枚金币（视觉上显示为星星）。
- 收集至少 3 枚并存活到倒计时结束即可通关。
- 通关轨迹会在下一关变成幽灵，并在相同时间重放。
- 每通过一关增加一个历史幽灵；碰到幽灵立即失败。
- 鼠标、WASD、方向键和触屏拖动均可控制角色。
- 每关开始有 1.25 秒幽灵碰撞保护。
- 浏览器 LocalStorage 保存历史最高关卡。

## 目录

```text
again-game/
├── index.html
├── package.json
├── README.md
├── CONTRIBUTING.md
├── src/
│   ├── main.js
│   ├── core/
│   │   ├── config.js
│   │   ├── game.js
│   │   ├── player.js
│   │   └── coin.js
│   ├── ghost/
│   │   ├── recorder.js
│   │   ├── replay.js
│   │   └── ghost.js
│   ├── ui/
│   │   ├── renderer.js
│   │   ├── interface.js
│   │   └── style.css
│   └── shared/
│       └── contracts.js
├── test/
│   └── game.test.js
└── docs/
    └── ARCHITECTURE.md
```

模块接口与状态字段详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。原始单文件 Demo 仍保留在最初的本地项目目录中，供回归对照，不属于本仓库的构建内容。
