# Codex Beacon · Codex 灯塔

[中文](#中文) · [English](#english) · [GitHub](https://github.com/Young581/codex-beacon) · [Issues](https://github.com/Young581/codex-beacon/issues)

## 中文

在 VS Code 中按项目管理 Codex 任务，查看彩色状态灯，在每轮回复结束、等待回答或审批时获得提醒。

![Codex Beacon dashboard with synthetic tasks](https://raw.githubusercontent.com/Young581/codex-beacon/main/docs/dashboard.png)

### 功能

- 按项目、对话和环境分组，显示 Codex 聊天名称、轮次、模型、任务状态和时间。
- 单列紧凑任务卡片；每条详情独立展开，查看每轮 token、API 费用估算和完整编号。
- 彩色状态：运行、等待回答／审批、本轮完成、失败、取消和状态未确认。
- 异步提问允许任务继续执行，同时计入“进行中”和“等待处理”；收到用户答复后退出等待。
- 打开对应 Codex 会话，切换到对应项目窗口或恢复已关闭的项目窗口。
- 任务右上角直接打开会话、标为已读和删除；项目名称旁打开项目窗口。标读后隐藏按钮和圆点，历史保留在“全部”；“清空已读”整轮移除已读历史，保留已确认活跃任务和未读任务的完整状态记录。
- 左侧按对话筛选，原生侧栏显示“项目 → 对话名称 → 第几轮”；窄窗口提供项目和对话下拉列表。轮次按当前保留记录编号，删除或过期后会重新编号。
- 管理与设置使用分类导航和单列内容，每行一个操作。
- Windows／Linux 系统桌面通知、窗口标题标记（macOS 为预览支持），Windows 额外提供任务栏标记，支持本机 WAV／MP3 自定义音效及试听。
- 完成、等待回答、等待审批可分别设置音效；未单独设置时跟随通用音效。
- 中文和英文界面随 VS Code 切换，也可手动选择语言。
- 本机采集内置；SSH／容器通过独立配套组件采集事件。

### 安装与使用

重开窗口或重启采集器后，旧的进行中／等待处理状态需等待新的活动事件确认；明确的完成、失败与取消结果保留。同一项目和对话开始新一轮时，之前轮次的提醒自动已读，历史与用量保留。当前轮次和其他对话的提醒不受影响。

主扩展 ID：`Young581.codex-beacon`。要求 **Windows 或 Linux 桌面（macOS 为预览支持）、VS Code 1.96+、Python 3.8+**，以及在受信任文件夹中运行的 Codex 扩展。

本机安装主扩展即可。点击右下角 **Codex** 或运行 **Codex Beacon: 打开仪表盘**，即可打开管理面板。命令面板中的 **测试本机弹窗和声音** 可检查提醒。

Linux／macOS 默认使用 `python3`。Ubuntu 桌面需要 `notify-send` 和 `pw-play`（也支持 `paplay`／`ffplay`）；依赖缺失时可安装 `python3 openssl libnotify-bin pipewire-bin sound-theme-freedesktop`。Linux 通知提供“打开对话”按钮。macOS 使用系统 `osascript`／`afplay` 作为预览适配，系统通知没有直接打开对话按钮。详见[平台支持与测试范围](https://github.com/Young581/codex-beacon/blob/main/docs/platforms.md)。

Windows 会自动检测用户／系统标准目录、PATH 中的 Python 和 `py` 启动器，实际验证 Python 3.8+ 与所需标准库后才开始采集。优先使用真实安装；候选退出 101、缺失或版本过旧时自动尝试其他候选。无需安装 `py` 启动器或预先添加 PATH。显式配置的路径会被验证并保留。

本机仍需安装 Python 3.8+，扩展不附带 Python，也不会自动下载运行时。若仪表盘提示没有可用运行时，请从 [Python 官网](https://www.python.org/downloads/windows/)安装，或在 `codexBeacon.localPythonPath` 填写有效 Python 可执行文件的绝对路径，然后点击 **管理与设置 → 测试与连接 → 重启当前环境采集器**。101 表示启动失败，不能仅据此认定 Codex Home 有误。

默认读取该环境的 `CODEX_HOME` 或 `~/.codex`。完成弹窗和声音默认开启，可在设置中分别关闭；系统勿扰模式可能抑制通知。

SSH／容器项目需要在目标环境安装并启用 **Codex Beacon Collector**（`Young581.codex-beacon-collector`），并在那里安装 Python 3.8+。主扩展的 **检查／安装当前环境的组件** 可定位该组件。本地音效仍在本机播放。远端集成有自动化检查，本次未进行真实 SSH／容器环境验证。

### 提示音与用量

在 **管理与设置 → 提醒与显示 → 提示音音量** 拖动滑块，设置 0–100% 音量，0% 为静音。系统声音、自定义 WAV／MP3、各类提醒和试听共用此音量，默认 100%；不会改变系统或其他应用的音量。也可设置 `codexBeacon.soundVolume`，立即生效。

打开 **管理与设置 → 提醒与显示 → 提示音场景**，选择通用、本轮完成、等待回答或等待审批，再选择音频文件、试听或恢复默认。每类音效独立保存，留空跟随通用音效；通用音效留空使用 系统声音。仍受声音总开关控制，完成音效还受 `soundOnDone` 控制。

对应设置：`codexBeacon.soundFileOnDone`、`codexBeacon.soundFileOnQuestion`、`codexBeacon.soundFileOnApproval`。SSH／容器项目也使用当前电脑的音频。合并提醒只播放一次，按审批、回答、完成的顺序选择最高优先级音效。

在管理面板选择 **自定义提示音**，选取本机 WAV／MP3 文件，也可设置 `codexBeacon.soundFile`。支持试听和恢复系统音；文件失效时回退到系统音。更换音效无需重载。

每轮用量和费用放在任务详情里。金额为美元 **API 估算，不是实际账单**；未知或不完整的数据会明确标注。使用 `codexBeacon.modelPrices` 按精确模型名称覆盖默认单价，单位为每百万 token：

```json
{
  "codexBeacon.modelPrices": {
    "my-model": {"input": 2, "cachedInput": 0.1, "cacheWrite": 2.5, "output": 10}
  }
}
```

本轮完成表示 Codex 本次回复结束，不代表训练、部署或其他后台工作完成。状态来自明确事件，静默不会被推断为失败。

等待回答来自结构化提问，普通文字问题无法可靠识别。在受信任的工作区中，采集器正常启动后会自动添加审批请求和结果 Hook；到 **Codex 设置 → Hooks → PermissionRequest 和 PostToolUse** 核对 Beacon 的脚本并点击 **Trust** 即可。[Codex 官方 Hook 文档](https://developers.openai.com/codex/hooks/)要求用户审核和信任未托管的 Hook；未信任时不会执行，扩展不会代替你作出审批决定。自动添加保留已有 Hook 定义和其他工具的配置；隐私暂停时不会添加。

打开仪表盘的 **管理与设置** 页，可直接调整语言、会话打开位置、选择或试听音效，查看审批 Hook 注册情况及信任步骤，并运行测试、查看连接、管理通知和清理隐私数据。通知菜单现在直接打开此页。手动移除 Hook 会同时关闭自动添加；重新配置按钮可用于修复配置。关闭自动添加开关会保留现有 Hook。

### 从旧版迁移

此版本使用独立扩展 ID 和 `codexBeacon.*` 设置。任务空闲时先停用旧通知扩展，再启用 Beacon，以免重复提醒；旧通知历史不自动迁移，Python、音效和自定义价格需要重新配置。Codex 会话和项目文件保留。此前配置过旧审批 Hook 的用户，先通过旧扩展移除，再按需配置和信任 Beacon 的 Hook。

### 数据与许可

没有开发者服务器、遥测上传或账号绑定。仅在本机／已有 VS Code 远端连接中处理通知和任务元数据，不复制聊天正文，不修改 Codex 原始会话。聊天名称按会话 ID 从标题索引和只读状态库匹配。详见 [隐私说明](https://github.com/Young581/codex-beacon/blob/main/PRIVACY.md)。

基于 [lengmo1996/codex-vscode-notifier](https://github.com/lengmo1996/codex-vscode-notifier)，保留 MIT 版权和许可。本项目由 Young581 独立维护，是社区扩展。

## English

Track Codex tasks by project and conversation in VS Code and get alerts when a response ends or input is needed. Compact cards show the chat title, numbered round, model, state and time. Open the session, mark read or delete from the card header; open the project window beside its name. Expand each card independently for tokens, estimated API costs and full identifiers. Marking read hides the unread dot and mark-read button; history remains under All and leaves the Unread filter. The native sidebar groups project → conversation → round, with no token count in row labels. Round numbers refer to retained records and are recalculated after deletion or expiry. Management uses category navigation and one control per row.

Use **Management and settings → Alerts and display → Notification sound volume** to set 0–100% volume for all notifications and previews. 0% mutes sound; the default is 100%. System sounds and custom WAV/MP3 use the same level without changing system or other application volumes. The setting `codexBeacon.soundVolume` takes effect immediately.

### Getting started

After a window or collector restarts, saved running/waiting states require fresh activity evidence; completed, failed and canceled results remain final. Starting a new round reads earlier-round reminders in the same project and conversation while retaining history and usage. Current-round reminders and other conversations are unaffected.

Install **Codex Beacon**, ID `Young581.codex-beacon`, on **Windows or a Linux desktop (macOS preview), VS Code 1.96+ and Python 3.8+**. Open a trusted project folder with the Codex extension. Click the **Codex** status-bar button to open the dashboard, or run **Open dashboard** from the command palette.

Linux/macOS default to `python3`. Ubuntu needs `notify-send` and `pw-play` (or `paplay`/`ffplay`); install `python3 openssl libnotify-bin pipewire-bin sound-theme-freedesktop` if missing. Linux notifications offer Open conversation. macOS uses system `osascript`/`afplay` as a preview; its system notifications have no direct conversation action. See [platform support and test scope](https://github.com/Young581/codex-beacon/blob/main/docs/platforms.md).

Local collection is embedded. Windows detects Python in standard installation directories and PATH and validates Python 3.8+ and the required standard libraries before collection starts. Actual runtimes are preferred over launchers; candidates that exit with 101, are missing or are too old are skipped automatically. The optional `py` launcher and a PATH entry are not required. Explicit Python settings are validated and retained.

Python 3.8+ must still be installed locally; the extension does not bundle or download it. If the dashboard reports no usable runtime, install it from [python.org](https://www.python.org/downloads/windows/) or set `codexBeacon.localPythonPath` to a working executable's absolute path, then click **Management and settings → Tests and connections → Restart current collector**. Exit code 101 indicates startup failure and does not by itself mean Codex Home is misconfigured. Completion popups and sounds are enabled by default and can be adjusted independently. Run **Test desktop notification and sound** to verify them.

For SSH/container projects, install **Codex Beacon Collector** (`Young581.codex-beacon-collector`) and Python in that environment. Use **Check / install components for this environment** to locate it. Native audio plays on your Windows computer. Remote integration has automated checks but has not been tested against a live SSH/container host in this release.

In **Management and settings → Alerts and display → Sound scenario**, select Common, Completion, Question or Approval, then choose a local WAV/MP3 file, preview it or reset it. Each event sound is independent; an empty override inherits `codexBeacon.soundFile`, and an empty common sound uses the system sound. Settings: `codexBeacon.soundFileOnDone`, `codexBeacon.soundFileOnQuestion`, `codexBeacon.soundFileOnApproval`. The global sound switch and completion's `soundOnDone` still apply. Merged alerts play once, preferring approval, then question, then completion. Settings also include language, notification policies and custom model prices (`codexBeacon.modelPrices`, USD per million tokens). Estimated costs are API estimates rather than bills; unknown and partial usage remains labeled.

Colored states distinguish running, waiting for input/approval, response complete, failed, canceled and unknown. Finishing a response does not prove that background work has finished. Pausing alerts keeps recording history; marking read does not approve an action. Approval reminders require a separately configured and trusted hook.

Asynchronous questions count under both Running and Needs attention while work continues; an acknowledgement is not a user answer. Structured replies clear matching pending questions. Approval request and result hooks are registered automatically after healthy collection starts in a trusted workspace. Review and trust the Beacon commands under **Codex settings → Hooks → PermissionRequest and PostToolUse**. The dashboard's **Management and settings** page contains sound, language, session location, hook guidance, tests, connections, history and privacy controls. Removing the hooks disables automatic setup. See the [official Codex hook documentation](https://developers.openai.com/codex/hooks/).

### Migration and privacy

Disable older notifier extensions before enabling Beacon to avoid duplicate alerts. This listing uses independent IDs, the `codexBeacon.*` settings namespace, notification history, caches and hook ownership. Reapply custom settings. Existing conversations and project files are retained; old notification history is not imported.

No developer server, telemetry upload or account binding. Notification metadata stays on your computer or travels through your existing VS Code remote connection. Read the [privacy policy](https://github.com/Young581/codex-beacon/blob/main/PRIVACY.md).

Based on the MIT-licensed [upstream project](https://github.com/lengmo1996/codex-vscode-notifier), independently maintained by Young581.
