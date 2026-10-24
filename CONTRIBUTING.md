# 团队协作说明

开发原则：三个人只修改自己负责的目录；公共文件由成员 A 统一维护；所有功能通过 Pull Request 合并到 `main`。

## 文件归属

| 成员 | 开发分支 | 可以修改 | 不应随意修改 |
| --- | --- | --- | --- |
| 成员 A | `feature/core` | `src/core/`、`src/main.js`、公共文件 | `src/ghost/`、`src/ui/` |
| 成员 B | `feature/ghost` | `src/ghost/` | `src/core/`、`src/ui/`、公共文件 |
| 成员 C | `feature/ui` | `src/ui/` | `src/core/`、`src/ghost/`、公共文件 |

公共文件包括 `index.html`、`package.json`、`src/shared/`、`docs/ARCHITECTURE.md`，统一由成员 A 修改。README、CONTRIBUTING 和测试若需修改，应先在团队群里说明。

## 第一次开始

```bash
git clone https://github.com/Qiu-lin-8/again-game.git
cd again-game
git fetch origin
git switch <你的开发分支>
git merge origin/main
npm install
npm run dev
```

## 日常提交

开始工作前先同步 `main`：

```bash
git fetch origin
git merge origin/main
```

只暂存自己负责的文件：

```bash
git status
git diff
git add <明确的文件路径>
git commit -m "feat: 简短说明改动"
git push -u origin HEAD
```

禁止使用 `git add .` 夹带队友文件，禁止对共享分支使用 `git push --force`。

## Pull Request 与合并

1. 功能分支推送后，在 GitHub 创建目标为 `main` 的 Pull Request。
2. PR 正文说明修改范围、测试命令、手动验证结果和已知风险。
3. 合并前由另一名成员执行 `npm test`、`npm run build`，并在浏览器完成相关玩法检查。
4. 使用 **Squash and merge** 合并；仓库所有者负责最终集成。
5. 合并后其他成员再次执行 `git fetch origin` 和 `git merge origin/main`。

## 避免互相覆盖

- 开工前在群里声明正在修改的文件。
- 不跨目录“顺手重构”队友模块。
- 需要改变公共接口时，先修改 `docs/ARCHITECTURE.md` 并由三人确认，再改实现。
- `ui` 只能读取游戏状态快照，不能直接修改 `core` 状态。
- 冲突时联系原作者共同处理，不要直接选择“全部接受当前”或“全部接受传入”。
- AI 工具开始工作前必须读取最新代码和本文件，并明确允许修改的文件范围。
- 不向 AI 或仓库提交 Token、密码、API Key、Cookie、`.env` 等敏感信息。
