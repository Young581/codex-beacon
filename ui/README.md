# Codex Beacon · Codex 灯塔

[中文](#中文) · [English](#english) · [GitHub](https://github.com/Young581/codex-beacon) · [Issues](https://github.com/Young581/codex-beacon/issues)

## 中文

在 VS Code 中按项目管理 Codex 任务，查看彩色状态灯，在每轮回复结束、等待回答或审批时获得提醒。

![Codex Beacon dashboard with synthetic tasks](https://raw.githubusercontent.com/Young581/codex-beacon/main/docs/dashboard.png)

### 功能

- 按项目和环境分组，显示 Codex 聊天名称、模型、任务状态和时间。
- 单列紧凑任务卡片；每条详情独立展开，查看每轮 token、API 费用估算和完整编号。
- 彩色状态：运行、等待回答／审批、本轮完成、失败、取消和状态未确认。
- 打开对应 Codex 会话，切换到对应项目窗口或恢复已关闭的项目窗口。
- Windows 桌面通知、任务栏和窗口标题标记，支持本机 WAV／MP3 自定义音效及试听。
- 中文和英文界面随 VS Code 切换，也可手动选择语言。
- 本机采集内置；SSH／容器通过独立配套组件采集事件。

### 安装与使用

主扩展 ID：`Young581.codex-beacon`。要求 **Windows x64、VS Code 1.96+、Python 3.8+**，以及在受信任文件夹中运行的 Codex 扩展。

本机安装主扩展即可。点击右下角 **Codex** 或运行 **Codex Beacon: 打开仪表盘**，即可打开管理面板。命令面板中的 **测试本机弹窗和声音** 可检查提醒。

Windows 会自动识别 `py` 启动器或用户／系统标准目录及 PATH 中的 Python，无需安装 `py` 启动器或预先添加 PATH。仍无法识别时，在 `codexBeacon.localPythonPath` 设置 Python 可执行文件的绝对路径。默认读取该环境的 `CODEX_HOME` 或 `~/.codex`。完成弹窗和声音默认开启，可在设置中分别关闭；Windows 勿扰模式可能抑制通知。

SSH／容器项目需要在目标环境安装并启用 **Codex Beacon Collector**（`Young581.codex-beacon-collector`），并在那里安装 Python 3.8+。主扩展的 **检查／安装当前环境的组件** 可定位该组件。Windows 本地音效仍在本机播放。远端集成有自动化检查，本次未进行真实 SSH／容器环境验证。

### 提示音与用量

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

### 从旧版迁移

此版本使用独立扩展 ID 和 `codexBeacon.*` 设置。任务空闲时先停用旧通知扩展，再启用 Beacon，以免重复提醒；旧通知历史不自动迁移，Python、音效和自定义价格需要重新配置。Codex 会话和项目文件保留。此前配置过旧审批 Hook 的用户，先通过旧扩展移除，再按需配置和信任 Beacon 的 Hook。

### 数据与许可

没有开发者服务器、遥测上传或账号绑定。仅在本机／已有 VS Code 远端连接中处理通知和任务元数据，不复制聊天正文，不修改 Codex 原始会话。聊天名称按会话 ID 从标题索引和只读状态库匹配。详见 [隐私说明](https://github.com/Young581/codex-beacon/blob/main/PRIVACY.md)。

基于 [lengmo1996/codex-vscode-notifier](https://github.com/lengmo1996/codex-vscode-notifier)，保留 MIT 版权和许可。本项目由 Young581 独立维护，是社区扩展。

## English

Track Codex tasks by project in VS Code and get alerts when a response ends or input is needed. Compact, single-column cards show the chat title, model, state and time. Expand each card independently for per-turn tokens, estimated API costs and session/window actions.

### Getting started

Install **Codex Beacon**, ID `Young581.codex-beacon`, on **Windows x64 with VS Code 1.96+ and Python 3.8+**. Open a trusted project folder with the Codex extension. Click the **Codex** status-bar button to open the dashboard, or run **Open dashboard** from the command palette.

Local collection is embedded. Windows automatically detects the launcher or Python in standard installation directories and PATH; the optional `py` launcher is not required. If Python cannot be found, set `codexBeacon.localPythonPath` to its absolute executable path. Completion popups and sounds are enabled by default and can be adjusted independently. Run **Test desktop notification and sound** to verify them.

For SSH/container projects, install **Codex Beacon Collector** (`Young581.codex-beacon-collector`) and Python in that environment. Use **Check / install components for this environment** to locate it. Native audio plays on your Windows computer. Remote integration has automated checks but has not been tested against a live SSH/container host in this release.

Choose a local WAV/MP3 file with **Customize notification sound**, preview it, or restore the system sound. Settings include `codexBeacon.soundFile`, language, notification policies and custom model prices (`codexBeacon.modelPrices`, USD per million tokens). Estimated costs are API estimates rather than bills; unknown and partial usage remains labeled.

Colored states distinguish running, waiting for input/approval, response complete, failed, canceled and unknown. Finishing a response does not prove that background work has finished. Pausing alerts keeps recording history; marking read does not approve an action. Approval reminders require a separately configured and trusted hook.

### Migration and privacy

Disable older notifier extensions before enabling Beacon to avoid duplicate alerts. This listing uses independent IDs, the `codexBeacon.*` settings namespace, notification history, caches and hook ownership. Reapply custom settings. Existing conversations and project files are retained; old notification history is not imported.

No developer server, telemetry upload or account binding. Notification metadata stays on your computer or travels through your existing VS Code remote connection. Read the [privacy policy](https://github.com/Young581/codex-beacon/blob/main/PRIVACY.md).

Based on the MIT-licensed [upstream project](https://github.com/lengmo1996/codex-vscode-notifier), independently maintained by Young581.
