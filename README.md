# Codex Beacon · Codex 灯塔

为 VS Code 中的 Codex 提供按项目分组的任务列表、状态灯、token 与费用估算，以及完成提醒。

基于 [lengmo1996/codex-vscode-notifier](https://github.com/lengmo1996/codex-vscode-notifier) 的 MIT 开源项目，包含 Windows PowerShell 路径修复和安装辅助脚本。当前版本为主扩展 **0.8.0**、采集器 **0.5.0**。

## 当前功能

- Codex 每轮回复结束时提醒，可开启 Windows 弹窗与声音。
- 窗口标题和任务栏标记，帮助定位需要处理的窗口。
- 按项目目录与来源分组，每轮请求一条任务；可切回未读／已读通知列表。
- 项目／任务行的“打开项目窗口”按钮：切换到已打开的窗口，或重新打开已关闭的本机、SSH／容器项目。
- 彩色状态灯：运行、等待回答／审批、完成、失败、取消及状态未确认。
- 按轮次与模型统计 token，美元 API 费用估算，支持自定义单价。
- 未读提醒与任务状态独立；同一任务的多条通知合并显示，保留去重和会话跳转。
- 结构化提问提醒；审批提醒需要另外配置并信任 Hook。
- 中文和英文界面。

本轮回复结束不代表部署、训练或其他后台任务已经完成。当前 Windows 本机模式经过验证；SSH、容器和 WSL 未在本仓库的本次修复中进行实际环境验证。

## 安装

需要 Windows、VS Code ≥ 1.96 和 Python 3.8+。

从 [Releases](https://github.com/Young581/codex-beacon/releases) 下载主扩展与采集器的 VSIX 文件，在 VS Code 扩展面板选择“从 VSIX 安装”。也可自行构建：

```powershell
git clone https://github.com/Young581/codex-beacon.git
cd codex-beacon
python -B build.py --output dist
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

安装脚本会开启完成弹窗和声音，指定检测到的 Python 路径，并在修改用户设置前备份。若自动识别失败，通过 `-CodeCommand` 指定 Microsoft VS Code 的 `bin/code.cmd`，通过 `-PythonPath` 指定 Python 可执行文件。

不使用脚本时，在 VS Code 用户设置中开启：

```json
{
  "codexBeacon.notificationsEnabled": true,
  "codexBeacon.notifyOnDone": true,
  "codexBeacon.desktopNotifications": true,
  "codexBeacon.desktopOnDone": true,
  "codexBeacon.sound": true,
  "codexBeacon.soundOnDone": true
}
```

如 Python 不在启动器默认位置，还需在 `codexBeacon.localPythonPath` 中设置其完整路径。默认用户配置以外的 VS Code Profile 需要在该 Profile 中单独配置。

在任务空闲时运行“开发人员：重新加载窗口”。升级后若共享通知后台仍使用旧代码，可在任务空闲时关闭所有 VS Code 窗口，等待 10 秒后再打开。验证提醒可运行 **Codex 通知：测试本机弹窗和声音**。

Windows 勿扰模式、通知权限和静音设置可能影响实际提醒。首次启用任务栏状态时，扩展会在原 `window.title` 模板前加入 `${codexBeaconNotification}${separator}`。

## 仪表盘

点击右下角 **Codex 状态栏按钮**、侧栏任务面板顶部的 **仪表盘图标**，或在命令面板运行 **Codex Beacon: 打开仪表盘**。独立页面在主编辑器区域打开，重复点击复用同一个标签；打开管理面板保持未读状态。

![Codex Beacon 仪表盘，合成任务示例](docs/dashboard.png)

- 左侧切换项目；窄窗口改为项目下拉列表。
- 查看项目数、运行／等待处理任务与未读数。
- 按运行、等待处理、完成、失败／取消和未读筛选，搜索项目、模型或会话。
- 单列任务卡片默认显示聊天标题、模型、状态、时间与短轮次编号，通常为两到三行；展开一条不会展开其他任务。
- token、API 费用估算、完整会话与用量信息，以及打开会话／窗口、标读和删除按钮，均放入可展开的任务详情。
- 提示音选择、试听、暂停、语言和设置入口集中在页面里。状态与数据实时更新。

仪表盘和侧栏使用同一组任务、价格和通知数据，打开页面保持未读状态。任务详情中的未知用量与金额不显示为零；`*` 表示含部分统计，金额仍是 API 估算。截图来自真实隔离 VS Code，使用合成数据。安装后，在任务空闲时重新加载相关窗口即可启用。

聊天名称来自当前环境 Codex 的标题索引与只读状态库，按会话 ID 匹配；改名后刷新管理面板即可更新。相同聊天的多轮请求共用聊天名称，短轮次编号用于区分任务，完整编号保留在详情中。没有可用标题时显示短会话编号，不从聊天正文生成名称。

## 自定义提示音

打开任务面板右上角“…” → 通知菜单 → **自定义提示音**，或在命令面板运行 **Codex Beacon: 自定义提示音**，选择本机 WAV／MP3 文件。该菜单也可 **试听当前提示音** 或 **恢复系统默认提示音**。试听只播放声音，不弹出桌面通知；即使声音总开关关闭，主动试听仍播放。试听会在历史中留下测试记录。

所选音频用于本轮完成、等待审批和等待回答的声音提醒。也可在用户设置中填写 `codexBeacon.soundFile` 的本机绝对路径；留空使用系统提示音。SSH／容器项目也读取 Windows 本机音频。修改后无需重载；首次从旧版升级需在任务空闲时关闭全部 VS Code 窗口，等待 10 秒再打开，以更新共享通知后台。

文件被删除或无法解码时自动回退到系统提示音，并提示一次。部分特殊 WAV／MP3 编码可能不被 Windows 支持，建议使用 PCM WAV 或常见 MP3。合并的提醒只播放一次，以优先级最高且启用声音的提醒选择音频（审批、提问、完成）。选择音频不会自动开启已关闭的声音总开关。音频文件只在本机读取，不打包或上传。

## 本次修复

通知和任务栏辅助进程统一通过 Windows 系统目录内的 PowerShell 绝对路径启动，修复 VS Code 继承的 PATH 缺少 PowerShell 时出现的 `spawn powershell.exe ENOENT`。没有修改系统 PATH，也没有放宽通信认证。

增加了空 PATH 下真实启动辅助进程的回归测试，同时修正两处上游测试问题。测试范围和来源见 [验证说明](docs/verification.md)。

## 开发与验证

Windows 本机使用 Node 24 和 Python 3.13 运行：

```powershell
python -B packaging/sync-local-collector.py --check
$tests = Get-ChildItem tests -Filter '*.js' | Where-Object { $_.Name -ne 'tls-runtime-smoke.js' } | ForEach-Object { $_.FullName }
node --test --experimental-test-isolation=none $tests
python -B tests/remote-collector.py
python -B tests/package-validation.py
python -B test-configuration.py
python -B build.py --output dist
```

真实 VS Code 宿主测试按 [宿主测试说明](packaging/README.md) 使用独立用户数据和合成会话。仓库提供 Windows CI 工作流，用于检查与生成可下载的构建产物。

## 项目任务与费用

侧栏 **Codex Beacon → 任务** 默认按项目目录与来源分组，同名但目录或来源不同的项目保持独立，本窗口项目优先。每轮请求是一条任务，不代表整个项目或后台作业；点击打开会话，悬停查看完整目录、轮次、模型与用量。标题栏的分组按钮可切回原通知列表。

弹窗与提示音测试单独归入 **测试**，用试管图标和时间显示。测试记录不显示任务用量或未知状态，也不计入管理面板的项目任务统计。

顶部使用简短的“任务”标题和图标按钮。全部标读、清空已读、清空全部以及完整通知菜单收纳在右上角 **“…”** 内，窄侧栏无需拉宽即可访问。

菜单默认跟随 VS Code 界面语言，可在通知菜单的语言选项或 `codexBeacon.language` 中选择 `auto`、`zh-CN`、`en`。右键与顶部操作只显示一种语言，并跟随插件语言即时切换；命令面板与设置采用 VS Code 的界面语言。

任务行显示紧凑 token 数与简短状态；K 表示千，M 表示百万，`*` 表示部分统计。金额与完整用量放在管理面板的可展开任务详情里。

将鼠标移到项目分组或任务行，点击窗口图标 **打开项目窗口**。它只切换／恢复项目窗口，保留未读状态；普通任务点击仍打开对应会话。目标通知组件暂未连接时也能恢复保存的项目 URI，包括多根工作区文件和远端连接地址；已关闭的子项目不会跳到其父目录窗口。

旧通知没有保存远端地址时，会尝试从 VS Code 最近项目恢复；同一路径匹配多个 SSH／容器连接时需选择连接。未找到连接信息则需手动打开正确远端项目一次，后续通知会记住它。

| 状态 | 颜色 | 依据 |
| --- | --- | --- |
| 进行中 | 蓝 | 明确的任务开始或恢复事件 |
| 阻塞 · 等待回答 | 黄 | 结构化提问；回答返回后恢复 |
| 等待回答 · 继续运行 | 紫 | 异步提问，可继续工作 |
| 阻塞 · 等待审批 | 橙 | 已配置的审批提醒 Hook |
| 本轮完成 | 绿 | 本轮回复结束 |
| 失败 | 红 | 明确的任务失败事件 |
| 已取消 | 灰 | 明确的中断事件 |
| 状态未确认 | 灰 | 来源窗口未连接或日志未提供状态 |

状态基于最后采集到的事件，不根据静默或某次工具报错推断任务失败。没有开始事件的旧通知仍显示完成状态，但不会补造 token 用量。用量更新静默，不增加未读。清空已读会保留进行中的任务，以及仍有未读提醒的任务用量。

默认单价来自 [OpenAI 官方价格表](https://developers.openai.com/api/docs/pricing)，核对日期 **2026-10-10**，单位为美元／百万 token。默认使用短上下文价格；有 `service_tier` 时使用该档位，否则按 Standard 估算。可通过 `codexBeacon.pricingContext` 和 `codexBeacon.pricingTier` 覆盖上下文与档位。

内置模型：`gpt-6.1-sol`、`gpt-6-astra`、`gpt-6-luna`、`gpt-5.6-sol`、`gpt-5.3-codex`。金额为 **API 估算，不是实际账单**，不包含其他会话、子代理或后台任务。未知模型和未支持档位显示未知；缺少模型单价显示“未配置单价”。推理 token 包含在输出中，缓存命中和缓存写入从普通输入中扣除，避免重复计费；切换模型分别计价。

在 VS Code 设置中编辑 `codexBeacon.modelPrices`，按精确模型名覆盖最终单价，自定义价格不再乘服务档位系数。产生缓存写入 token 时还需要 `cacheWrite`。例如：

```json
{
  "codexBeacon.groupBy": "project",
  "codexBeacon.modelPrices": {
    "my-model": {"input": 2, "cachedInput": 0.1, "cacheWrite": 2.5, "output": 10}
  }
}
```

每轮用量通过累计计数的增量统计，不把整段会话累计值归到当前任务。缺少完整基线会标注“部分统计”，没有用量显示“Token 未提供”。只读取近期活动日志的有限尾部，不全量扫描历史正文。

适配器采用本机观察到的 Codex 日志格式。[官方 App Server 文档](https://developers.openai.com/codex/app-server)描述了 token 用量事件，但会话日志不是稳定公共 API；未知格式会保留未知值。

## 后续方向

- 更多 AI 编程工具的状态与提醒整合。
- 项目预算、用量筛选与统计导出。

这些属于后续计划，当前版本尚未实现。

## 来源与许可

源代码基于上游提交 `4fa74775c65980a5015e0515b5877bc4ebe51e45`，保留原版权声明及 [MIT 许可证](LICENSE)。[UPSTREAM.md](UPSTREAM.md) 保存原项目介绍。

这是独立维护的衍生项目，市场发布准备使用 `Young581.codex-beacon` 与 `Young581.codex-beacon-collector` 两个新 ID；发布者权限确认及市场上传尚待完成。命令、设置、缓存与 Hook 所有者均使用独立标识。迁移及发布说明见 [docs/marketplace.md](docs/marketplace.md)。旧版通知历史不自动迁移；启用新版前，在任务空闲时停用旧通知扩展并重新配置自定义设置。
