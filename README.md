# old-gsd-cleanup

一个保守的跨平台清理工具，用来移除旧 `gsd-build/get-shit-done` 包和它写入各类 AI 编程工具配置目录里的遗留安装产物。

它只针对旧作者/旧组织发布的包：

- `get-shit-done-cc`
- `@gsd-build/sdk`

它不会卸载或主动删除新的社区包：

- `@opengsd/get-shit-done-redux`
- `@opengsd/gsd-sdk`
- `@opengsd/gsd-pi`

## 快速使用

预览并逐项确认删除：

```bash
npx old-gsd-cleanup
```

不逐项确认，直接删除匹配到的旧安装产物：

```bash
npx old-gsd-cleanup --yes
```

只预览，不删除文件：

```bash
npx old-gsd-cleanup --dry-run
```

## 它会做什么

默认会先执行：

```bash
npm uninstall -g get-shit-done-cc
npm uninstall -g @gsd-build/sdk
npm cache clean --force
```

然后扫描常见 runtime 配置目录，查找包含旧包标记的安装产物：

- `get-shit-done-cc`
- `@gsd-build`
- `gsd-build/get-shit-done`
- `github.com/gsd-build`

覆盖的常见目录包括 Claude Code、Codex、Cursor、Trae、Copilot、Gemini、OpenCode、Kilo、Windsurf、Augment、Qwen、Hermes、CodeBuddy、Cline、Antigravity 等工具的配置目录。

## 安全边界

工具不会因为文件名是 `gsd-*` 就直接删除。它会先确认文件内容里存在旧 `gsd-build` 标记，再把删除目标收敛到真正的安装产物，例如：

- `get-shit-done/`
- `skills/gsd-*`
- `commands/gsd*`
- `agents/gsd-*`
- `hooks/gsd-*`

如果路径显示它属于 `@opengsd/*` 或 `open-gsd/get-shit-done-redux`，即使文件里提到了旧 `gsd-build` 迁移信息，也会跳过。普通 `gsd-*` 文件只因迁移说明提到 `@opengsd` 时也会跳过；但明确的旧安装目录，例如 `get-shit-done/` 或 `get-shit-done-cc/`，仍会被识别为 legacy 目标。

缓存目录也不会整目录清空。工具只会匹配带有强旧包标记的具体缓存文件或明确的 legacy 缓存子目录，例如 `get-shit-done-cc/`；不会因为存在 `~/.cache/gsd` 就直接删除整个目录。实际删除同样遵守 `--dry-run`、`--yes` 和逐项确认流程。

工具会跳过会话历史、日志、全局状态文件等高误伤区域，例如：

- `projects/`
- `sessions/`
- `archived_sessions/`
- `history/`
- `logs/`
- `.codex-global-state.json`

## 关于旧 npx 卸载器

网上常见的清理命令里包含：

```bash
npx get-shit-done-cc --uninstall --global
npx get-shit-done-cc --uninstall --local
```

本工具默认不执行这两条命令，因为 `npx get-shit-done-cc` 可能会重新下载并执行旧包代码。

如果你明确想先跑旧卸载器，再做后续清理，可以使用：

```bash
npx old-gsd-cleanup --run-old-npx
```

非交互模式：

```bash
npx old-gsd-cleanup --run-old-npx --yes
```

## 命令选项

```text
--yes, -y          不逐项确认，直接删除匹配到的旧安装产物
--dry-run          只打印将要执行的命令和匹配到的文件，不删除文件
--skip-npm         跳过 npm uninstall/cache cleanup
--run-old-npx      额外执行 npx get-shit-done-cc --uninstall ...
--skip-file-scan   跳过 runtime 配置目录扫描
--help, -h         显示帮助
--version, -v      显示版本
```

## 本地开发

```bash
npm run check
```

查看将要发布到 npm 的文件：

```bash
npm pack --dry-run
```

如果本机沙箱或权限不允许 npm 写默认缓存，可以临时指定缓存目录：

```bash
npm --cache .npm-cache pack --dry-run
```

## 发布到 npm

确认包名可用后：

```bash
npm login
npm publish --access public
```

发布后，用户可以直接运行：

```bash
npx old-gsd-cleanup
```

## License

MIT
