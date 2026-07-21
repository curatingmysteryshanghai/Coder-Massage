[English](README.md) · **简体中文** · [日本語](README.ja.md) · [한국어](README.ko.md) · [हिन्दी](README.hi.md)

# Coder Massage / coder马杀鸡

> AI gap time 里的小小仪式。

**Coder Massage / coder马杀鸡** 是一组为 AI Agent 使用者设计的、可主动进入、低注意力的微型游戏。为了让现有安装继续兼容，仓库保留技术标识 `jieya`。

<p align="center">
  <img src="./games/needlewhile/design/preview.png" alt="Needlewhile 扎会儿的像素时空之门与毛线球游戏" width="100%">
</p>

## 我们为什么做这件事

Vibe coding 带来了一种新的停顿：我们发出 prompt，AI Agent 开始执行，任务仍然牵着我们，但眼前暂时没有下一步可以做。我们把这段间隙称为 **AI gap time**。

刷社交媒体和短视频当然可以填满它。现实的工作环境也常常让人无法离开座位、开始另一项活动，或顺畅地切换注意力。我们想提供另一种选择：几秒钟就能开始、随时可以放下、几乎不占用脑力，并且容易回到工作的本地小体验。

这些体验刻意保留了漫无目的的空间。没有分数、连续签到、信息流或必须完成的进度。我们把这种低压力的小型玩耍视为数字健康的一部分。

AI 时代，有人制造引擎，有人用引擎构建 Agent。我们的团队更想设计围绕这些系统的关系：人和 AI 如何一起工作、等待、恢复，再回到同一个任务。

## 当前游戏

目前唯一开放安装和用户测试的游戏是 **[Needlewhile / 扎会儿](./games/needlewhile/)**。

点击鼠标或按下普通按键，就会把一根针扎进毛线球。这个小动作就是全部。时空之门始终由用户主动进入；只有用户选择后，浏览器才会打开。

| 编号 | 游戏 | 类别 | 状态 | 可安装 |
| --- | --- | --- | --- | --- |
| 01 | **Needlewhile / 扎会儿** | 触觉小动作 | 用户测试中 | 是 |

## 接下来会发生什么

当前兼容运行时固定进入扎会儿，正式发布目录里也只有这一款。未来，集合级时空之门会在符合条件的游戏中随机选择一款；进入游戏后，用户可以通过界面内的切换器前往其他游戏，同时沿用同一段 AI 任务计时。

```text
现在：时空之门 → 扎会儿
未来：时空之门 → 随机游戏 ↔ 游戏内切换器 ↔ 其他游戏
```

新的游戏概念在拥有独立包、通过验证并明确发布状态前，不会进入可安装目录。详见[游戏目录](./games/README.md)、[仓库架构](./docs/ARCHITECTURE.md)与[时空之门契约](./docs/PORTAL.md)。

## 项目状态

| 层级 | 状态 |
| --- | --- |
| Coder Massage / coder马杀鸡（游戏集合） | 早期开发中 |
| Needlewhile / 扎会儿 | 可安装 · 用户测试中 |
| 时空之门随机分配 | 计划中 |
| 游戏内切换器 | 计划中 |
| 其他游戏 | 暂无公开版本 |

## 快速安装

在仓库根目录运行：

```sh
sh ./install.sh --codex
```

完整操作说明包含公开/私有仓库下载、macOS/Linux、Windows、Claude Code、验证、更新和故障恢复：

- [安装指南](./docs/INSTALLATION.md)
- [仓库架构](./docs/ARCHITECTURE.md)
- [新增游戏规范](./docs/ADDING_A_GAME.md)
- [游戏目录](./games/README.md)

## 安装责任边界

AI 助手可以检查环境、下载仓库、运行安装器并验证结果。Codex Hook 授权只能由所有者本人完成。所有者需要亲自检查 `UserPromptSubmit`、`PostToolUse` 与 `Stop`；AI 助手不得代替所有者批准 Hook 信任，也不得编辑信任记录。请遵循[安装与验证契约](./docs/INSTALLATION.md#installation-responsibilities)。

## 名称说明

- **Coder Massage / coder马杀鸡**：产品与游戏集合名称
- **`jieya`**：仓库与插件市场的兼容技术标识
- **Needlewhile / 扎会儿**：Game 01，也是当前唯一安装目标
- **`needlewhile@jieya`**：Codex 中的标准插件 ID

产品显示名称仍可继续演变；这些技术标识会保持稳定，以兼容现有安装。

## 隐私

当前版本在本地运行。控制器只绑定 `127.0.0.1`，并使用随机访问令牌。经过清理的短任务名称只保存在内存里，原始 prompt 不会写入磁盘。项目不使用全局键盘监听、辅助功能权限、数据分析、账号、广告或远程游戏服务。

## 许可证

MIT。本仓库是 Magic Fan 的早期开发版本。
