# 平台支持 / Platform support

## 中文

主扩展在本机 VS Code 中运行；SSH／容器使用目标环境中的配套采集器。本机通知和音效始终在运行 VS Code 界面的电脑上播放。

| 平台 | 状态 | 桌面通知与音效 | 状态灯 |
| --- | --- | --- | --- |
| Windows | 已验证 | PowerShell 系统通知、系统声音及 WAV／MP3 | 侧栏、状态栏、窗口标题、任务栏标记及闪烁 |
| Ubuntu 24.04 桌面 | 已验证，Wayland / GNOME 46 | libnotify 通知及“打开对话”按钮；PipeWire 音效、独立音量、WAV／MP3 与回退 | 侧栏、状态栏、窗口标题 |
| 其他 Linux 桌面 | 兼容实现，尚待各桌面实测 | 需要兼容 freedesktop 的通知服务；通知按钮、显示时长由桌面决定 | 侧栏、状态栏、窗口标题 |
| macOS | 预览适配；尚无真机桌面验收 | 系统 AppleScript 通知及 afplay 音效；允许通知后使用 | 侧栏、状态栏、窗口标题 |

需要 VS Code 1.96+、Python 3.8+ 和桌面 Codex 扩展。Linux／macOS 默认使用 `python3`，也可以在仪表盘设置 Python 的绝对路径；无需额外安装 Node.js，正式扩展使用 VS Code 自带的运行时。

### Ubuntu 依赖

Ubuntu 桌面通常已经提供以下工具；若缺失，可运行：

```bash
sudo apt install python3 openssl libnotify-bin pipewire-bin sound-theme-freedesktop
```

Linux 通知使用 `notify-send` 与 GNU `stdbuf`。音效依次选择 `pw-play`、`paplay`、`ffplay`；只有工具不存在时才尝试下一个播放器。提示音音量仅用于当前音频流，不修改系统总音量。自定义文件播放失败时回退到系统音；没有系统音时可选择本机 WAV／MP3。0% 不读取或播放音频文件。

测试原生通知和声音需要登录图形桌面，并连接该用户的 D-Bus 和音频会话。SSH 命令成功返回只证明系统接口接受通知；勿扰模式、通知设置、扬声器和 VMware 音频设备仍决定是否实际可见、可听。

### macOS 预览限制

系统 `osascript` 负责通知，`afplay` 负责音效。根据系统提示允许通知，再在仪表盘中运行测试。此后端的系统通知没有直接打开 Codex 对话的按钮；请使用 VS Code 内提示、侧栏或仪表盘打开对话。

自动化 CI 覆盖 JavaScript、采集器、打包和本机 TLS 通信，不代表通知权限、可见弹窗、扬声器或跨窗口激活已经通过真机验收。正式推荐 macOS 前，仍需真实 Mac 或测试者验收。

### 测试边界

Ubuntu 验证使用 VMware 中已登录的桌面、独立 VS Code 用户数据及合成会话，不重载现有项目窗口，也不恢复用户的真实 Codex 对话。任务分组、状态、轮次、自动已读、仪表盘、导航和音效沿用同一实现。Windows 专属任务栏辅助组件在 Linux／macOS 不启动。

## English

The main extension runs on the computer hosting the VS Code UI. SSH/container workspaces use the companion collector in the remote environment. Notifications and audio always run locally.

| Platform | Status | Notifications and audio | State indicators |
| --- | --- | --- | --- |
| Windows | Verified | PowerShell native notifications, system sounds and WAV/MP3 | Sidebar, status bar, window titles, taskbar overlays and flashing |
| Ubuntu 24.04 desktop | Verified on Wayland / GNOME 46 | libnotify notifications with an Open conversation action; PipeWire audio, independent volume and WAV/MP3 fallback | Sidebar, status bar and window titles |
| Other Linux desktops | Implemented; individual desktop testing pending | Requires a freedesktop notification service; action support and timing depend on the desktop | Sidebar, status bar and window titles |
| macOS | Preview; physical desktop acceptance pending | System AppleScript notifications and afplay audio; requires notification permission | Sidebar, status bar and window titles |

Requires VS Code 1.96+, Python 3.8+ and the desktop Codex extension. Linux/macOS use `python3` by default, or an explicit executable in dashboard settings. End users do not need a separate Node.js installation.

Ubuntu dependencies, when missing:

```bash
sudo apt install python3 openssl libnotify-bin pipewire-bin sound-theme-freedesktop
```

Linux uses `notify-send` and GNU `stdbuf`. Audio selects `pw-play`, `paplay`, then `ffplay`, trying another player only when the preceding executable is missing. Volume applies to each stream without changing global volume. Unreadable or unsupported custom audio falls back to a system sound. If no sound theme is available, select a local WAV/MP3. 0% skips audio reads and playback.

Native tests need a logged-in desktop with its user D-Bus and audio session. A successful SSH command confirms acceptance by the notification interface; visibility and audibility still depend on Do Not Disturb, notification permissions, speakers and VMware audio.

macOS uses system `osascript` and `afplay`. Allow notifications and run the dashboard test. System notifications have no direct Codex conversation action in this backend; use VS Code prompts, the sidebar or dashboard. CI verifies code, the collector, packaging and local TLS, but physical Mac testing is still needed for visible notifications, audio and window activation.

Ubuntu acceptance uses an isolated VS Code profile and synthetic conversations in a VMware desktop. Existing project windows are not reloaded and real user conversations are not resumed. Windows-specific taskbar helpers do not start on Linux/macOS.
