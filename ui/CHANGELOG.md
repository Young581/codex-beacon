# Changelog

## 0.9.1

- 审批请求与 PostToolUse 工具结果通过操作摘要配对；升级时保留已有 hook，自动补齐结果 hook。
- 修复 SSH 长会话中异步提问被误标为阻塞；保留问题投递类型。
- 审批提醒缓冲 12 秒，同一操作返回结果、模型恢复执行或本轮结束后自动已读并取消待发及重试通知。Token 更新和无关并行工具返回不会单独清除待审批。
- Fix nonblocking questions being shown as blocked in long SSH conversations.
- Buffer approval alerts for 12 seconds and cancel resolved reminders on verified model continuation or a terminal round result. Preserve genuine waits across usage-only updates and unrelated parallel tool results.

## 0.9.0

- 新增 Linux 桌面通知，复用 libnotify；“打开对话”沿用原有窗口路由，已读／删除后不再响应旧通知按钮。
- Linux 复用 PipeWire／PulseAudio／FFmpeg 播放系统及 WAV／MP3 音效，支持独立音量、0% 静音、分场景设置与失效回退。
- Unix 通信使用较短的私有套接字目录，修复长路径连接失败；保留双向 TLS 和证书校验。
- 新增 macOS AppleScript／afplay 预览后端，兼容系统 LibreSSL；桌面通知权限、音效和真机窗口操作尚待 Mac 验收。
- 增加 Linux／macOS 持续集成；在 Ubuntu 24.04 Wayland 桌面验证真实 VS Code 宿主、系统通知接口和音效。
- Add Linux native alerts/audio, short private Unix socket paths and a macOS preview backend; retain existing Windows behavior.

## 0.8.10

- 重开窗口或重启采集器后，历史“进行中／等待处理”需由新的活动事件重新确认；保留明确的完成、失败和取消结果。
- 同一项目和对话开始新一轮时自动标读之前轮次，取消旧提醒的排队播放；当前轮次和其他对话不受影响，历史与用量保留。
- 通知后台升级到 v11，迁移 v10 历史；区分历史回放与新活动，避免恢复旧任务的活动状态。
- Require fresh evidence for restored activity and automatically acknowledge earlier rounds when a new round starts.

## 0.8.9

- 启动前实际验证 Python 3.8+ 及标准库，优先使用已安装运行时，候选启动失败（含 101）时自动检测其他安装。
- 采集与审批 Hook 使用验证后的 Python 绝对路径，保留用户显式配置；隔离错误的 Python 环境变量。
- 没有可用运行时时显示安装／配置和重启步骤，不再只提示通用退出码；支持取消检测并保留工作区信任与隐私暂停。
- Verify Python before collection and fall back from unusable launchers; report actionable runtime errors.

## 0.8.8

- 仪表盘“管理与设置 → 提醒与显示”加入 0–100% 音量滑块，0% 静音，默认 100%。
- 系统提示音、自定义 WAV／MP3、各类提醒及试听共用独立播放音量，不修改系统或其他应用音量。
- 通知使用对应项目窗口的最新音量；升级至通知协议 v10 并迁移 v9 历史。
- Adjust notification and preview volume from the dashboard, including system sounds and custom audio.

## 0.8.7

- 修复原生侧栏每轮任务右侧按钮：直接打开对应 Codex 对话，成功后标为已读。
- “打开项目窗口”按钮只显示在项目行，保留任务的标为已读与删除操作。
- Open the corresponding conversation from each sidebar task; keep project-window navigation on project rows.

## 0.8.6

- 本轮完成、等待回答、等待审批可以分别设置本机 WAV／MP3 音效，留空跟随原有通用音效。
- 管理与设置 → 提醒与显示增加提示音场景选择，每类可选择文件、试听及恢复跟随通用音效。
- 音效按对应项目窗口的设置选择，保留声音总开关、完成声音开关和合并提醒的优先级；文件无法播放时回退系统声音。
- 更新通知协议至 v9，优先迁移 v8 历史且保留旧版文件，支持新缓存的保护和隐私清理。
- Configure and preview completion, question and approval sounds independently, with common-sound inheritance and destination-window routing.

## 0.8.5

- 任务卡片右上角直接提供打开会话、标为已读和删除，无需展开详情。
- 原生侧栏按项目 → 对话 → 轮次分组；仪表盘加入对话筛选，显示第几轮，隐藏短编号和侧栏 token 数。
- 轮次按当前保留记录编号，状态优先排序和筛选保持轮次；完整编号及用量仍可在详情查看。
- 管理与设置改为左侧分类导航、右侧单列内容，每行一个操作，适配窄窗口。
- Promote read/delete actions, group conversations with numbered rounds, and simplify settings with category navigation and one control per row.

## 0.8.4

- 审批 Hook 在采集器正常启动后自动注册，保留已有定义、其他 Hook 和隐私暂停；信任仍由用户在 Codex 中完成。
- 仪表盘新增“管理与设置”：直接调整语言、会话位置和音效，并集中提供审批、测试、连接、通知及隐私操作。
- 通知菜单直接打开仪表盘管理页；移除审批 Hook 会关闭自动添加。
- Automatically register approval hooks and centralize controls in the dashboard's Management and settings page.

## 0.8.3

- 修复异步提问的 `accepted: true` 被误当成用户答复，导致“等待回答”立刻恢复为进行中。
- 匹配结构化用户答复与问题编号，多道问题全部答完后恢复，保留用量与终态。
- 异步等待计入“等待处理”汇总及筛选；侧栏统一显示待处理计数。
- Fix asynchronous question acknowledgements being treated as answers; keep pending questions visible until matching replies arrive.

## 0.8.2

- 已读任务隐藏“标为已读”按钮和未读圆点；全部列表保留历史，未读筛选移除已读任务。
- “打开会话”移到任务卡片右上角，无需展开详情。
- “打开项目窗口”移到项目名称旁，保持未读与独立任务详情。
- Hide the mark-read action after reading, promote session navigation to each card header, and place project-window navigation beside the project name.

## 0.8.1

- Fix fresh Windows installs when Python is installed without the optional `py` launcher or a PATH entry.
- Detect supported Python installations in standard user/system directories and executable PATH entries; preserve explicit Python settings.
- Add a real extension-host test mode that exercises the default Python configuration.

## 0.8.0

- Prepare the independent Codex Beacon Marketplace identity and companion.
- Isolate commands, settings, window title variables, approval hooks and caches from upstream extensions.
- Add Marketplace branding, current documentation and completion popups enabled by default.
- Existing task dashboard, custom sounds and per-turn usage remain available.

## 0.7.0

- 任务卡片默认只显示聊天标题、模型、状态、时间与轮次，单列排列，每条详情独立展开。
- token、估算费用与任务操作收进任务详情；侧栏任务行只显示 token 和状态。
- 从 Codex 标题索引与只读状态数据库匹配聊天名称，改名可刷新；无标题时显示短会话编号。
- 仅同步已有任务的标题，保留任务时间与未读；本机协议 v8 从 v7 迁移记录。
- Compact single-column task cards with Codex chat names; usage and actions live in independent task details.

## 0.6.1

- 右下角 Codex 状态栏按钮直接打开管理面板，保持未读状态；提示文字同步更新。
- 弹窗与声音测试归入“测试”，显示试管图标与时间，不再显示无项目、无用量或未知任务状态。
- The Codex status bar opens the dashboard; notification tests have their own labeled group and rows.

## 0.6.0

- 新增在编辑器中打开的 Codex Beacon 仪表盘，采用独立设计，随 VS Code 主题与窗口宽度调整。
- 项目导航、状态筛选、搜索、任务卡片、精确用量详情、token／估算费用汇总和实时更新。
- 卡片可打开会话、打开项目窗口、标读与删除整轮记录；接入提示音、试听、暂停及设置。
- 中英文即时切换；不复制会话正文，不请求外部资源或账号接口。
- Added a responsive editor dashboard for projects, task states, usage, estimated costs and notification controls.

## 0.5.4

- 增加“自定义提示音”：选择本机 WAV／MP3 文件，单独试听或恢复系统默认提示音。
- 本轮完成、审批与提问提醒使用所选音频；保留静音、暂停和前台过滤行为。
- 音频无法读取或解码时回退到系统音，提示一次；不重复发送桌面通知。
- Custom local WAV/MP3 notification sounds, preview and system-default fallback.

## 0.5.3

- 右键与顶部菜单只显示所选语言，默认跟随 VS Code；切换插件语言后菜单即时更新。
- 命令和设置加入 VS Code 标准语言资源，去除固定的中英双语文字。
- 任务行优先显示精简 token／估算费用及简短状态，完整编号与准确用量保留在悬停详情中。
- Compact usage-first task rows and single-language menus, with live Chinese/English switching.

## 0.5.2

- 标题缩短为“任务”（英文界面为 Task），顶部保留切换分组按钮。
- 全部标读、清空已读、清空全部与完整通知菜单移入“…”菜单，窄侧栏无需拉宽即可操作。
- Compact task title and overflow actions keep the toolbar usable in narrow sidebars.

## 0.5.1

- 项目分组与任务行新增“打开项目窗口”：切换到已有窗口，关闭后恢复项目；只打开窗口时保持未读。
- 保存本机、SSH／容器项目 URI 和多根工作区文件，目标组件断连时也可打开；旧远端通知可从最近项目恢复连接。
- 已关闭的子项目不会错误跳转到父目录窗口；协议 v7 优先迁移 v6 历史，保留原权限与通信认证检查。
- Open/focus corresponding project windows without consuming unread reminders; retain remote authorities and saved workspace files.

## 0.5.0

- 按项目与来源分组，每轮一条任务，支持切回通知历史。
- 彩色状态灯：运行、等待回答／审批、完成、失败、取消及未知。
- 按轮次与模型统计 token，估算美元费用并支持自定义单价。
- 用量更新静默，状态与已读独立；协议 v6 保留 v5 通知历史。

## 0.4.3 (local fix)

- 使用 Windows 系统目录内的 PowerShell 绝对路径启动桌面通知和任务栏辅助进程，修复 PATH 缺少 PowerShell 时的 `spawn powershell.exe ENOENT`。通信与认证保持不变。
- Launch desktop-notification and taskbar helpers with the existing absolute Windows PowerShell path, fixing ENOENT when PATH does not contain PowerShell.
- 增加 PATH 为空时的真实通知与任务栏辅助进程回归测试；测试静默执行，不显示弹窗或发声。

## 0.4.2

- 开启桌面提醒时，同时在当前前台 VS Code 窗口显示可点击提示，不再只依赖 Windows 系统气泡。单条提示跳转到来源窗口；合并提示打开通知历史。点击不额外播放声音，关闭提示不标读。
- When desktop alerts are enabled, also show a clickable message in the foreground VS Code window. A single alert routes to its source window; a batch opens notification history. Clicking adds no sound; dismissing does not mark notifications read.
- 回复结束提醒仍需开启 `codexNotifier.desktopOnDone`。升级后请在任务空闲时关闭所有 VS Code 窗口，等待 10 秒再打开，以替换共享通知后台。
- Reply completion popups still require `codexNotifier.desktopOnDone`. After upgrading, close all VS Code windows when tasks are idle, wait 10 seconds, then reopen to replace the shared notification backend.

## 0.4.1

- 新增公开 GitHub 仓库、双语首页、下载和问题反馈入口；运行逻辑与上一版本一致。
- Added the public GitHub repository, bilingual project page, downloads, and issue links. Runtime behavior is unchanged.

## 0.4.0

- 新增独立的中文／English 语言选择，默认中文；弹窗、日志和运行时说明随设置切换。切换不重启采集、不改变已读状态。
- Added independent Chinese/English runtime language selection, defaulting to Chinese. Popups, logs, and runtime labels follow the setting without restarting collection or changing read states.

- 补充完整中英文功能、安装、行为边界及隐私说明；命令和设置项增加双语解释。
- Add Chinese/English feature, installation, behavior and privacy documentation, with bilingual command labels and setting descriptions.
- 扩展身份、运行逻辑、设置默认值不变。 Extension identities, runtime behavior and setting defaults are unchanged.

# 0.3.3

- 默认回到 Codex 插件会话侧栏；新增菜单和 Open Location 设置，可选择主编辑器打开。
- 默认关闭窗口聚焦自动标读，点击仅标读被点击的通知；主动跳转期间暂停焦点／标签自动标读。
- 侧栏路径先聚焦目标窗口，避免 windowId 数字前缀路由，检测到焦点改变时保留未读。
- 明确侧栏路由请求与后端对话恢复确认的区别，保留显式自动标读偏好。

# 0.3.2

- 统一入口关联新的远端组件 ID `lengmo1996.codex-notifier-collector`，修复原市场条目删除后无法下载的问题。
- 补充旧远端组件卸载及新组件安装说明，保留现有采集与隐私行为。

# 0.3.1

- 主扩展更名为“Codex 会话通知”，统一安装入口关联配套远端采集器。
- 新增当前环境组件检查、扩展页面安装引导及缺失组件状态栏提示。
- 检查通过跨宿主命令识别远端组件，避免误判为未安装；不自动重载窗口或恢复暂停的采集。
- 保留现有提醒、标读、清理与当前用户通信隔离。

# 0.3.0

- 本机通信改为新身份与双向认证，限制当前用户访问，拒绝旧版明文握手。
- 新增通知缓存保留期、预览后清理和显式恢复；保留原始对话及无关配置。
- 补充隐私说明、共享账号边界与备份保留限制。
- 回复结束提示音默认开启，点击及标读继续静音。

# Changelog

## 0.2.0

- Accept only verified VS Code-origin sessions; ignore Desktop, CLI and unclassified legacy collector events.
- Embed local folder collection in the Windows UI extension. Remote Collector 0.1.1 runs only remotely.
- Acknowledge existing window notifications silently on returning to that window; selecting a Codex editor acknowledges only its session. Later arrivals stay unread.
- Add single-entry deletion, clear-read and clear-all actions; preserve deduplication and cancel pending delivery for deleted entries.
- Use broker protocol v4 with one-time history migration. Remote Collector 0.1.0 must be upgraded.

## 0.1.5

- Open the selected session as a Codex editor tab directly inside the broker-selected destination window.
- Verify the exact custom-editor tab is selected and explicitly focus its window through the local workbench command.
- Avoid global extension URI dispatch, which can route window ID 1 to window 16 in the tested VS Code 1.135.0 build and make remote sessions fail with "no rollout found".
- Keep navigation failures unread and clicks silent. Opening a tab acknowledges the reminder; it does not verify that the Codex backend has finished loading the conversation.
- Add a real VS Code custom-editor fixture test verifying the destination workspace, exact session URI and opened tab, plus a read-only reproduction of the installed URL router defect.

## 0.1.4

- Pulse the unread window-title dot every 800 ms while retaining completion/decision text and count; stop on acknowledgement, setting disable or disposal.
- Restart native taskbar flashing when a window with unread notifications moves into the background, including notifications received in the foreground.
- Preserve retries after native failures and reconnects; prevent outdated attention updates after read/disable changes during binding.
- Keep animation local to the window-title context with no notification sounds, settings writes or per-frame broker traffic.

## 0.1.3

- Add native per-window Windows taskbar yellow/red indicators and background flashing; add a completion/decision prefix to each window's taskbar preview title.
- Bind native windows using a temporary unique title nonce plus verified process, executable and window class; reject ambiguous or stale handles.
- Preserve custom title templates and update per-window context without repeated configuration writes.
- Remove the incorrect local extension-registry prerequisite for navigating to remote Codex sessions.
- Silence clicks immediately and mark read only after the destination accepts navigation; keep failures unread without replaying canceled sounds.
- Distinguish failed startup attempts from established broker disconnects.
- Use a v3 broker and migrate v2/v1 history without changing live older instances.

## 0.1.2

- Highlight the matching window's Codex status item: yellow for unread completion, red for approval or questions.
- Separate current-window unread, other-window unread and read history; add explicit labels and contrasting icons.
- Make history clicks silent acknowledgements and route them to the matching window and Codex session.
- Cancel pending alerts when acknowledged; briefly silence the window while its notifications are being handled.
- Route desktop notification clicks and preserve their exact notification identity.
- Use a separate v2 broker and migrate prior history once, allowing windows to update when idle.

## 0.1.0

- Initial private VSIX with completion, approval, structured question alerts and shared history.
