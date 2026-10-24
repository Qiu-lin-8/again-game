# Ghosts of Me 模块架构与接口契约

## 目标

项目保持三层：`core` 管规则，`ghost` 管轨迹，`ui` 管显示与输入。`src/main.js` 是唯一组装入口。模块通过明确的方法和只读快照协作，不直接修改对方内部数据。

所有位置、半径、速度和碰撞计算统一使用 Canvas 内部坐标。Canvas 固定为 `960 × 540`；CSS 只负责等比缩放显示。

## 依赖方向

```text
main.js
├── core/game.js ──> core/player.js + core/coin.js
│                 └─> ghost/ghost.js
├── ui/interface.js
└── ui/renderer.js

shared/contracts.js  定义跨模块模式值和 JSDoc 数据形状
```

- `core` 不访问 DOM，不绘图。
- `ghost` 不访问 DOM，不处理金币、得分或输赢。
- `ui` 不持有或修改核心状态，只发送输入并读取快照。
- `main.js` 每帧依次读取输入、更新游戏、分发视觉事件、渲染快照。

## GameSnapshot 稳定契约

`Game#getSnapshot()` 每次返回一个新快照。UI 不得修改它。

| 字段 | 类型 | 含义 | 单位与范围 |
| --- | --- | --- | --- |
| `mode` | `'menu' \| 'playing' \| 'clear' \| 'over'` | 当前页面/游戏阶段 | 固定枚举值 |
| `level` | `number`（整数） | 当前关卡 | 从 `1` 开始，无上限 |
| `elapsed` | `number` | 当前关已经经过的时间 | 秒，`0..10` |
| `timeLeft` | `number` | 当前关剩余时间 | 秒，`0..10` |
| `score` | `number`（整数） | 当前整局累计分数 | 从 `0` 开始 |
| `best` | `number`（整数） | 本浏览器记录的最高到达关卡 | 从 `1` 开始 |
| `coinsGot` | `number`（整数） | 当前关已收集金币数 | `0..5` |
| `goal` | `number`（整数） | 当前关通关所需金币数 | 当前固定为 `3` |
| `player` | `PlayerSnapshot` | 玩家当前位置与碰撞半径 | Canvas 坐标/像素 |
| `coins` | `CoinSnapshot[]` | 当前关 5 枚金币及收集状态 | 数组长度固定为 `5` |
| `ghosts` | `GhostSnapshot[]` | 当前时间点的历史幽灵位置 | 第 N 关最多 N-1 个 |
| `arena` | `ArenaSnapshot` | 可移动区域 | Canvas 坐标/像素 |
| `graceLeft` | `number` | 剩余幽灵免碰撞时间 | 秒，`0..1.25` |
| `outcome` | `null \| object` | 结算页所需的只读结果摘要 | 非结算状态为 `null` |

### 嵌套对象

```js
player = { x: number, y: number, radius: number }
coins = [{ x: number, y: number, taken: boolean }]
ghosts = [{
  id: string,
  sourceLevel: number,
  x: number,
  y: number,
  trail?: [{ x: number, y: number }]
}]
arena = { x: number, y: number, w: number, h: number }
```

- `x`、`y`：Canvas 内部坐标，单位为像素。玩家中心始终限制在竞技场内。
- `radius`：碰撞圆半径，单位为像素；玩家当前为 `17`。
- `taken`：`true` 表示金币已收集，不再绘制或重复计分。
- `id`：幽灵稳定标识，格式为 `ghost-{sourceLevel}`。
- `sourceLevel`：生成该轨迹的历史关卡，从 `1` 开始。
- `trail`：仅供 UI 绘制残影的可选位置，不参与碰撞。

## core 公共接口

### `new Game(options?)`

```js
new Game({
  storage,       // 可选，兼容 localStorage 的 getItem/setItem 对象
  random,        // 可选，返回 [0, 1) 的随机函数，测试时可注入
  ghostSystem    // 可选，符合下述 GhostSystem 接口的实例
})
```

### `game.advance()`

- `menu` / `over`：开始全新游戏，关卡、分数和幽灵历史重置。
- `clear`：进入下一关，保留得分与历史轨迹。
- `playing`：不执行操作。

### `game.update(deltaSeconds, input)`

推进一帧游戏。`deltaSeconds` 单位为秒，单帧最大按 `0.05` 处理。

```js
input = {
  left: boolean,
  right: boolean,
  up: boolean,
  down: boolean,
  pointer: { active: boolean, x: number, y: number }
}
```

### `game.getSnapshot()`

返回符合 `GameSnapshot` 的新对象，供 UI 只读使用。

### `game.consumeEvents()`

返回并清空尚未消费的视觉事件。事件只用于粒子效果，不参与规则判断。

## ghost 公共接口

由 `GhostSystem` 提供。调用顺序为 `reset → beginLevel → recordPosition* → finishLevel`，任何时刻都可调用 `getGhosts`。

### `reset()`

清空全部历史轨迹、当前录制器和活动关卡。无参数、无返回值。

### `beginLevel({ level, startPosition })`

- `level: number`：即将开始的关卡，整数且 `>= 1`。
- `startPosition: {x, y}`：玩家出生点，Canvas 坐标。

开始当前关的轨迹录制，并自动写入 `t = 0` 的首点。

### `recordPosition({ time, position })`

- `time: number`：当前关经过秒数，范围 `0..10`。
- `position: {x, y}`：玩家中心的 Canvas 坐标。

内部按至少 `0.045` 秒的间隔采样，调用者无需自行节流。

### `finishLevel({ level?, time, position })`

补写最终点并把当前轨迹加入历史。`level` 缺省时使用 `beginLevel` 的关卡；`time` 单位为秒；`position` 为最终 Canvas 坐标。返回：

```js
{ id: string, sourceLevel: number }
```

### `getGhosts(time)`

根据当前关时间进行分段线性插值，返回 `GhostSnapshot[]`。`time` 单位为秒，超出录制范围时停在首点或末点。

## ui 公共接口

### `createInterface({ canvas, onAction, getMode })`

返回：

- `getInput()`：返回一份当前鼠标/键盘/触屏输入快照。
- `update(gameSnapshot)`：更新指标和菜单/结算界面，不修改传入快照。

`onAction` 只向 `main.js` 发出“开始/继续/重开”意图；`getMode` 只用于决定是否接受输入。

开发服务器下，`main.js` 额外暴露只读的 `window.__ghostsOfMe.getSnapshot()`，供浏览器冒烟测试读取状态。生产构建不会提供可写游戏入口。

### `createRenderer(canvas, context)`

返回：

- `notify(events)`：接收已发生的视觉事件并生成粒子。
- `render(gameSnapshot, deltaSeconds, timestamp)`：根据快照绘制一帧。

## 修改接口的规则

1. 先修改本文件并在 Pull Request 中说明兼容性影响。
2. 保留现有字段和方法语义；新增字段优先使用可选字段。
3. 不允许 UI 取得 `Game.state` 引用或直接写入核心状态。
4. 接口变更必须同时更新测试，并由至少一名其他模块成员审核。
