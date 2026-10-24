# again-game 团队协作指南

这份说明面向三位团队成员。原则是：每个人在自己的功能分支开发，通过 Pull Request 合并到 `main`，不要直接覆盖队友的代码。

## 1. 第一次克隆仓库

```bash
git clone https://github.com/Qiu-lin-8/again-game.git
cd again-game
git fetch --all --prune
```

请先确认 Git 提交身份；邮箱可使用 GitHub 提供的 noreply 邮箱：

```bash
git config user.name "你的 GitHub ID"
git config user.email "你的 GitHub 邮箱或 noreply 邮箱"
```

以上配置默认只作用于本仓库，不会改动其他项目。

## 2. 切换自己的开发分支

- 核心玩法与逻辑：`feature/gameplay`
- 界面、动画与交互：`feature/ui`
- 扩展功能与创新玩法：`feature/features`

第一次切换：

```bash
git fetch origin
git switch feature/gameplay
```

把分支名换成自己的分支即可。不要直接在 `main` 上开发。

## 3. 提交代码

先检查本次改动，只提交与当前任务有关的文件：

```bash
git status
git diff
git add <文件路径>
git commit -m "feat: 简短说明本次改动"
```

推荐提交前缀：

- `feat:` 新功能
- `fix:` 修复问题
- `docs:` 修改文档
- `style:` 只调整样式
- `refactor:` 重构但不改变功能

一次提交只解决一个清楚的问题，提交信息要让队友一眼看懂。

## 4. 推送代码

第一次推送当前分支：

```bash
git push -u origin HEAD
```

之后直接执行：

```bash
git push
```

禁止对共享分支使用 `git push --force`。

## 5. 获取队友最新代码

开始当天工作或准备提 Pull Request 前，先同步 `main`：

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch <你的分支名>
git merge origin/main
```

如果合并产生冲突，先处理冲突并测试，再提交合并结果。不要用强制推送覆盖远程内容。

## 6. 创建 Pull Request

1. 把自己的分支推送到 GitHub。
2. 打开仓库页面，点击 **Compare & pull request**。
3. 确认目标分支（base）为 `main`，来源分支（compare）为自己的功能分支。
4. 标题说明做了什么，正文写清测试方法、影响文件和仍待处理的问题。
5. 邀请至少一位队友检查；确认能运行后再合并。

建议使用 **Squash and merge**，让一天内的提交历史保持简洁。合并后，其他成员及时同步 `main`。

## 7. 处理简单代码冲突

执行 `git merge origin/main` 后，如果 Git 提示冲突：

1. 运行 `git status` 查看冲突文件。
2. 打开文件，找到 `<<<<<<<`、`=======`、`>>>>>>>` 标记。
3. 和相关队友确认应该保留的内容，手动整理为最终版本并删除冲突标记。
4. 运行游戏或相关检查，确认两个功能都正常。
5. 提交解决结果：

```bash
git add <已解决的文件>
git commit -m "fix: 解决与 main 的合并冲突"
git push
```

拿不准时不要盲目选择“全部接受当前”或“全部接受传入”，先联系修改该文件的队友。

## 8. 三人协作约定

- 仓库所有者负责 `main` 的集成与最终合并；`feature/features` 同一时间只安排一人修改。
- 每项功能完成后，开发者把自己的功能分支推送到 GitHub，并创建目标为 `main` 的 Pull Request。
- Pull Request 合并前，由另一名团队成员检查代码并在本地运行；确认可用后再合并。
- 开工前在群里说清负责模块和预计修改的文件。
- 尽量按模块拆文件，避免三个人同时修改同一个 HTML、CSS 或核心状态文件。
- `main` 只放可运行、可演示的版本；功能通过 Pull Request 合并。
- 小步提交、小步合并，不要等到比赛结束前一次性提交大量改动。
- 合并前至少做一次本地运行检查；关键版本打标签或在提交信息中说明。

## 9. AI 编程工具协作注意事项

- 每次让 AI 修改前，明确任务范围、允许修改的文件和验收目标。
- 先让 AI 读取最新代码；开始工作前执行 `git pull` 或同步 `main`，避免基于旧版本生成代码。
- AI 生成的代码必须由成员本人检查、运行和提交，不能把“生成成功”当作“测试通过”。
- 不把 GitHub Token、密码、API Key、Cookie 或 `.env` 内容发给 AI，也不要提交到仓库。
- 不让 AI 执行 `git reset --hard`、强制推送、批量删除等破坏性操作，除非团队明确确认并已有备份。
- 不让多个 AI 同时修改同一个文件；如必须并行，先按文件或模块划清边界。
- Pull Request 中注明 AI 参与的主要部分、测试结果和已知风险，便于队友复核。
