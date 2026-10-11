'use strict';
// Only extension-owned templates are translated. Substitutions are opaque data.
const MESSAGES = {
  "提示音场景": "Sound scenario",
  "通用提示音": "Common sound",
  "本轮完成提示音": "Completion sound",
  "等待回答提示音": "Question sound",
  "等待审批提示音": "Approval sound",
  "跟随通用提示音": "Use common sound",
  "未单独设置的场景使用通用提示音；通用提示音为空时使用系统默认声音。": "Scenarios without a custom sound use the common sound. An empty common sound uses the system default.",
  "对话": "Conversations",
  "全部对话": "All conversations",
  "未命名对话": "Untitled conversation",
  "第 {0} 轮": "Round {0}",
  "{0} 轮": "{0} rounds",
  "轮次按当前保留的对话记录排序，筛选不会改变轮次。": "Rounds are numbered within retained conversation records; filters keep the same numbers.",
  "已恢复当前环境采集和本机通知接收。清理前的事件不会补回；启用自动添加时会注册缺失的审批 Hook，请在 Codex 中核对信任。": "Collection and receiving resumed. Earlier events will not be replayed. Automatic setup registers missing approval hooks; check their trust in Codex.",
  "管理与设置": "Management and settings",
  "提醒与显示": "Alerts and display",
  "测试与连接": "Tests and connection",
  "通知与数据": "Notifications and data",
  "审批提醒": "Approval reminders",
  "会话打开位置": "Open sessions in",
  "Codex 会话侧栏": "Codex sidebar",
  "主编辑器": "Main editor",
  "检查／安装当前环境组件": "Check/install this environment's component",
  "查看通知历史": "View notification history",
  "清空全部通知": "Clear all notification records",
  "全部标为已读": "Mark all as read",
  "测试本机弹窗和声音": "Test local notification and sound",
  "测试当前窗口采集链路": "Test this window's collection pipeline",
  "重启当前环境采集器": "Restart this environment's collector",
  "自动添加审批 Hook": "Automatically add the approval hook",
  "重新配置审批提醒": "Configure approval reminders again",
  "移除审批提醒": "Remove approval reminders",
  "打开 Codex": "Open Codex",
  "审批 Hook 已注册": "Approval hook registered",
  "审批 Hook 尚未注册": "Approval hook not registered",
  "正在检查审批 Hook": "Checking the approval hook",
  "正在添加审批 Hook": "Adding the approval hook",
  "审批 Hook 配置异常": "Approval hook configuration error",
  "请打开 Codex 设置 → Hooks → PermissionRequest，核对 Beacon 脚本并点击信任。已信任的无需重复操作。": "Open Codex settings → Hooks → PermissionRequest, review the Beacon script and click Trust. Already trusted hooks need no further action.",
  "插件无法确认 Codex 中的信任状态，请在 Hooks 页面核对。": "Check trust in Codex's Hooks page; the extension cannot confirm its trust status.",
  "采集器正常启动后自动添加。移除 Hook 时会关闭自动添加，避免重新出现。": "Added automatically after the collector starts successfully. Removing it turns off automatic setup.",
  "当前环境": "Current environment",
  "采集器": "Collector",
  "隐私清理会先展示范围并确认，清理后暂停采集和接收。": "Privacy cleanup previews its scope for confirmation, then pauses collection and receiving.",
  "移除当前环境的审批提醒并关闭自动添加？": "Remove approval reminders in this environment and turn off automatic setup?",
  "清空全部通知记录？": "Clear all notification records?",
  "已自动添加审批提醒 Hook。请在 Codex 设置 → Hooks 中核对并信任；仪表盘提供操作入口。": "Approval hook added automatically. Review and trust it in Codex settings → Hooks; open the dashboard for guidance.",
  "打开项目窗口": "Open project window",
  "全部": "All",
  "项目": "Projects",
  "试听提示音": "Preview sound",
  "Codex Beacon · 仪表盘": "Codex Beacon · Dashboard",
  "$(dashboard) 打开仪表盘": "$(dashboard) Open dashboard",
  "工作空间动态": "WORKSPACE SIGNAL",
  "项目任务总览": "Project overview",
  "跟踪每个项目的进度，用量与提醒。": "Track progress, usage and alerts across your projects.",
  "全部项目": "All projects",
  "等待处理": "Needs attention",
  "失败或取消": "Failed or cancelled",
  "已采集 Token": "Recorded tokens",
  "API 费用估算": "Estimated API cost",
  "有用量记录": "tasks metered",
  "任务费用未知": "tasks with unknown cost",
  "含部分统计": "Includes partial usage",
  "搜索项目、模型或会话": "Search projects, models or sessions",
  "搜索任务": "Search tasks",
  "打开会话": "Open session",
  "标为已读": "Mark read",
  "删除任务记录": "Delete task records",
  "任务详情": "Task details",
  "本轮任务": "Turn task",
  "刷新": "Refresh",
  "提示音": "Sound",
  "语言": "Language",
  "设置": "Settings",
  "暂停提醒": "Pause alerts",
  "恢复提醒": "Resume alerts",
  "隐私与恢复": "Privacy and recovery",
  "清空已读": "Clear read records",
  "连接状态": "Connection status",
  "通知后台已连接": "Notification broker connected",
  "正在重新连接": "Reconnecting",
  "采集异常": "Collection error",
  "提醒已暂停": "Alerts paused",
  "隐私清理后已暂停接收": "Receiving paused after privacy cleanup",
  "还没有项目任务": "No project tasks yet",
  "在 VS Code 的 Codex 中开始任务，进度和用量会自动出现在这里。": "Start a task in Codex for VS Code; progress and usage will appear here automatically.",
  "没有匹配的任务": "No matching tasks",
  "重置筛选": "Reset filters",
  "仅统计保留的任务记录；金额为 API 估算，完成表示本轮回复结束。": "Totals cover retained task records. Costs are API estimates; completion means this response ended.",
  "最近更新": "Last updated",
  "查看全部任务": "View tasks",
  "自定义提示音": "Custom notification sound",
  "正在检测可用的 Python 运行时。": "Checking installed Python runtimes.",
  "Python 检测已取消，请重试当前操作。": "Python detection was cancelled; retry the operation.",
  "未找到可用的 Python 3.8+。请安装 Python 3.8 或更新版本，或在 codexBeacon.{0} 指定有效的 Python 可执行文件，然后点击“重启当前环境采集器”。检测结果：{1}": "No usable Python 3.8+ runtime was found. Install Python 3.8 or newer, or set codexBeacon.{0} to a working Python executable, then click Restart current collector. Detection results: {1}",
  "{0} 将在 {1} 秒后重新检测 Python。": "{0} Python will be checked again in {1} seconds.",
  "提示音音量": "Notification sound volume",
  "所有提示音和试听共用此音量，0% 为静音；不会改变系统音量。": "All notification sounds and previews use this volume. 0% mutes sound; system volume is unchanged.",
  "$(unmute) 自定义提示音": "$(unmute) Custom notification sound",
  "选择音频文件（WAV／MP3）": "Choose audio file (WAV/MP3)",
  "Windows 系统默认提示音": "Default Windows notification sound",
  "试听当前提示音": "Preview current sound",
  "恢复系统默认提示音": "Restore default system sound",
  "选择本机提示音": "Choose a local notification sound",
  "使用此提示音": "Use this sound",
  "提示音路径无效。请选择本机 WAV 或 MP3 文件。": "Invalid sound path. Choose a local WAV or MP3 file.",
  "无法读取提示音文件。请重新选择本机 WAV 或 MP3 文件。": "Cannot read the sound file. Choose another local WAV or MP3 file.",
  "自定义提示音无法播放，已使用系统默认提示音。请重新选择有效的 WAV／MP3 文件。": "Cannot play the custom sound; the default system sound was used. Choose a valid WAV/MP3 file.",
  "旧版通知后台仍在运行。请在任务空闲后关闭所有 VS Code 窗口，等待 10 秒再重新打开，以启用自定义提示音。": "An older notification broker is still running. When tasks are idle, close all VS Code windows, wait 10 seconds and reopen to enable custom sounds.",
  "跟随 VS Code": "Follow VS Code",
  "通知语言": "Notification language",
  "$(globe) 语言": "$(globe) Language",
  "完成": "Done",
  "运行": "Running",
  "等回答": "Awaiting input",
  "等审批": "Awaiting approval",
  "异步等待": "Async input",
  "未知": "Unknown",
  "无用量": "No usage",
  "选择此项目的连接": "Choose this project's connection",
  "已打开对应项目窗口；通知保持未读。": "Opened the project window; the notification remains unread.",
  "此旧通知缺少项目连接信息。请先打开对应 SSH／容器项目一次，后续即可直接打开窗口。": "This older notification lacks the project connection. Open its SSH/container project once; future notifications can open its window directly.",
  "进行中": "Running",
  "阻塞 · 等待回答": "Blocked · Awaiting input",
  "等待回答 · 继续运行": "Awaiting input · Still running",
  "阻塞 · 等待审批": "Blocked · Awaiting approval",
  "本轮完成": "Turn completed",
  "失败": "Failed",
  "已取消": "Cancelled",
  "状态未确认": "Status unconfirmed",
  "Token 未提供": "Tokens unavailable",
  "费用未知": "Cost unknown",
  "部分统计": "Partial usage",
  "未配置单价": "Price not configured",
  "估算": "Estimated",
  "项目目录": "Project directory",
  "任务": "Task",
  "会话": "Session",
  "目标窗口": "Target window",
  "模型": "Model",
  "未提供": "Unavailable",
  "输入": "Input",
  "缓存命中": "Cache hits",
  "缓存写入": "Cache writes",
  "输出": "Output",
  "其中推理": "Including reasoning",
  "本窗口": "This window",
  "其他窗口": "Other windows",
  "{0} 进行中": "{0} running",
  "{0} 阻塞": "{0} blocked",
  "{0} 待处理": "{0} needing attention",
  "已采集任务合计": "Collected task totals",
  "金额为 API 估算，不是实际账单；不包含后台任务和其他会话。": "Amounts are API estimates, not actual bills; background jobs and other sessions are excluded.",
  "完成表示本轮回复结束。": "Completion means the current response ended.",
  "Codex 会话通知": "Codex Notifications",
  "空窗口": "Empty window",
  "本机": "Local",
  " · {0} · {1} 待处理": " · {0} · {1} pending",
  " · 其他窗口 {0}": " · Other windows: {0}",
  "点击打开管理面板": "Click to open the dashboard",
  "{0}\n本窗口 {1} 条待处理，所有窗口共 {2} 条未读\n点击打开管理面板": "{0}\n{1} pending in this window; {2} unread across all windows\nClick to open the dashboard",
  "{0}\n本窗口 {1} 条待处理，所有窗口共 {2} 条未读\n点击打开下一条待处理会话": "{0}\n{1} pending in this window; {2} unread across all windows\nClick to open the next pending session",
  "\n声音和弹窗已暂停，仍记录历史": "\nSound and popups are paused; history is still recorded",
  "{0}\n隐私清理后已暂停接收，不记录新通知。点击通知菜单 → 隐私与数据清理 → 恢复。": "{0}\nReceiving is paused after privacy cleanup; new notifications are not recorded. Open the notification menu → Privacy and data cleanup → Resume.",
  "$(shield) Codex · 接收已暂停": "$(shield) Codex · Receiving paused",
  "\n当前远端采集异常；可从通知菜单查看状态": "\nThe current collector has an error; check status in the notification menu",
  "\n当前远端采集异常，点击查看状态": "\nThe current collector has an error; click to view status",
  "本窗口 {0} 条待处理通知": "{0} pending notifications in this window",
  "本窗口 {0} · 全部 {1}": "This window: {0} · All: {1}",
  "新提醒会出现在这里。单击将静默打开对应会话；跳转请求被接受后标为已读。": "New notifications appear here. Click to open the session silently; the notification is marked read after the navigation request is accepted.",
  "当前 SSH／容器尚未连接采集组件。打开通知菜单 → 检查／安装当前环境组件。": "The collector is not connected in this SSH/container environment. Open the notification menu → Check/install the current environment component.",
  "$(extensions) Codex · 需安装远端组件": "$(extensions) Codex · Remote component needed",
  "点击检查并安装当前 SSH／容器的采集组件。": "Click to check and install the collector in this SSH/container environment.",
  "查看日志": "View logs",
  "当前环境的远端采集组件不可用。请从通知菜单选择“检查／安装当前环境组件”。": "The remote collector is unavailable. Choose ‘Check/install the current environment component’ in the notification menu.",
  "本地采集器尚未就绪。请打开受信任的本地文件夹，并检查本机 Python 和 Codex Home 设置。": "The local collector is not ready. Open a trusted local folder and check the local Python and Codex Home settings.",
  "{0}：旧采集器没有会话来源标识，已忽略此类提醒。请升级远端采集组件至 0.2.0，并在任务空闲后重载对应窗口。": "{0}: Notifications without a session origin were ignored. Update the remote collector to version 0.2.0 or later and reload the window when tasks are idle.",
  "Windows 本机测试": "Windows local test",
  "已提交一条本机测试通知；是否可见可听取决于 Windows 通知和音量设置。": "A local test notification was submitted; visibility and sound depend on Windows notification and volume settings.",
  "Codex 插件会话侧栏": "Codex session sidebar",
  "当前选择 · 默认": "Selected · Default",
  "默认": "Default",
  "中间主编辑器区域": "Main editor area",
  "当前选择": "Selected",
  "点击通知后在哪里打开会话": "Where to open sessions when clicking notifications",
  "当前环境状态：\n": "Current environment status:\n",
  "已请求在目标窗口的 Codex {0}打开会话：{1} · {2}": "Requested to open the session in the target window's Codex {0}: {1} · {2}",
  "会话侧栏": "session sidebar",
  "主编辑器": "main editor",
  "{0}\n目录：{1}\n会话：{2}\n目标窗口尚未连接，保留未读。": "{0}\nDirectory: {1}\nSession: {2}\nThe target window is not connected; the notification remains unread.",
  "对应窗口尚未连接通知组件。请打开该 SSH／容器窗口，或在升级后重载该窗口。": "The target window is not connected to the notification component. Open that SSH/container window, or reload it after updating.",
  "复制会话 ID": "Copy session ID",
  "$(layout-sidebar-right) 选择会话打开位置": "$(layout-sidebar-right) Choose where sessions open",
  "$(extensions) 检查／安装当前环境组件": "$(extensions) Check/install the current environment component",
  "$(history) 查看通知历史": "$(history) View notification history",
  "$(clear-all) 清空已读通知": "$(clear-all) Clear read notifications",
  "$(trash) 清空全部通知": "$(trash) Clear all notifications",
  "$(beaker) 测试本机弹窗和声音": "$(beaker) Test local popup and sound",
  "$(debug-disconnect) 测试当前窗口采集链路": "$(debug-disconnect) Test this window's collector connection",
  "$(bell) 恢复提醒": "$(bell) Resume alerts",
  "$(bell-slash) 暂停提醒（继续记录）": "$(bell-slash) Pause alerts (keep recording)",
  "$(shield) 配置当前环境的审批提醒": "$(shield) Configure approval alerts in this environment",
  "$(pulse) 查看连接状态": "$(pulse) View connection status",
  "$(settings-gear) 通知设置": "$(settings-gear) Notification settings",
  "$(shield) 隐私与数据清理": "$(shield) Privacy and data cleanup",
  "本机通知组件已连接": "Local notification component connected",
  "本机通知组件断开，将自动重连": "Local notification component disconnected; reconnecting automatically",
  "这条通知对应的窗口尚未连接。请打开对应 SSH／容器窗口，或在升级后重载该窗口。": "The notification's target window is not connected. Open the matching SSH/container window, or reload it after updating.",
  "Windows 系统通知显示失败，更新已保存在通知历史。": "Windows could not display the notification. The update is saved in notification history.",
  "Codex 通知 · 本地采集": "Codex Notifications · Local Collector",
  "Codex 本轮已回复": "Codex reply finished",
  "Codex 等待审批": "Codex awaiting approval",
  "Codex 等待回答": "Codex awaiting an answer",
  "Codex 通知测试": "Codex notification test",
  "只保留保留期、暂停状态、清理时间和新通信凭据，不含会话标识": "Only retention, pause state, cleanup time, and new communication credentials are retained; no session identifiers",
  "Codex 有 {0} 条新提醒": "Codex: {0} new notifications",
  "另有 {0} 条，请查看通知历史": "{0} more; see notification history",
  "通知缓存已重置": "Notification cache reset",
  "无法处理通知点击：": "Could not handle notification click: ",
  "通知连接已关闭": "Notification connection closed",
  "本机通知组件协议版本不匹配，请重载更新后的窗口": "Local notification protocol version mismatch; reload the updated window",
  "通知组件启动失败：": "Notification component failed to start: ",
  "无法启动本机通知组件：": "Could not start the local notification component: ",
  "连接超时": "Connection timed out",
  "本机通知身份验证超时": "Local notification authentication timed out",
  "本机连接超时": "Local connection timed out",
  "通知响应过大": "Notification response exceeds the size limit",
  "本机通知握手失败": "Local notification handshake failed",
  "通知请求失败": "Notification request failed",
  "认证完成前收到了通知消息": "Received a notification before authentication completed",
  "本机通知消息格式异常": "Invalid local notification message format",
  "本机通知连接在身份验证时关闭": "Local notification connection closed during authentication",
  "本机通知连接在建立前关闭": "Local notification connection closed before it was established",
  "本机通知连接中断": "Local notification connection interrupted",
  "通知组件未连接": "Notification component is not connected",
  "本机通知身份验证尚未完成": "Local notification authentication has not completed",
  "通知请求超时": "Notification request timed out",
  "通知扩展已关闭": "Notification extension closed",
  "已读": "Read",
  "● 未读": "● Unread",
  "{0} · {1}\n目标窗口：{2}\n目录：{3}\n会话：{4}\n{5}\n单击静默标记并打开对应会话": "{0} · {1}\nTarget window: {2}\nDirectory: {3}\nSession: {4}\n{5}\nClick to silently open the session and mark this notification read",
  "未读": "Unread",
  "尚未连接": "Not connected",
  "打开对应会话并标为已读": "Open the session and mark as read",
  "已定位配套采集组件。请在扩展页面选择“安装到 SSH／容器”，并确认已在当前环境启用。安装后如需重载，请等任务空闲。": "The companion collector is shown in Extensions. Choose ‘Install in SSH/container’ and enable it in the current environment. If a reload is required, wait until tasks are idle.",
  "重新检查": "Check again",
  "当前 SSH／容器的采集组件已连接。": "The collector in the current SSH/container environment is connected.",
  "本地采集组件已内置，无需另装远端组件。": "The local collector is built in; no separate remote component is needed.",
  "采集组件尚未就绪，请查看状态并检查是否已启用、工作区是否受信任及 Python 设置。": "The collector is not ready. Check its status, whether it is enabled, workspace trust, and Python settings.",
  "查看连接状态": "View connection status",
  "通知存储所有者或文件类型异常": "Unexpected notification storage owner or file type",
  "通知存储路径包含链接": "Notification storage path contains a link",
  "创建本机 TLS 身份失败；非 Windows 平台需要系统 OpenSSL": "Could not create the local TLS identity; non-Windows platforms require system OpenSSL",
  "无法保护本机通知存储或加载身份：": "Could not secure local notification storage or load its identity: ",
  "本机通知身份无效或已过期": "Local notification identity is invalid or expired",
  "本机通知组件身份验证失败": "Local notification component authentication failed",
  "不支持的本机安全协议": "Unsupported local security protocol",
  "这条通知没有有效的 Codex 会话标识，无法直接跳转。": "This notification has no valid Codex session ID and cannot open a session directly.",
  "通知数据已清理，已取消此前的跳转。": "Notification data was cleared; the earlier navigation was cancelled.",
  "未能确认目标 Codex 会话标签已打开，请检查此窗口中的 Codex 扩展后重试。": "Could not confirm that the target Codex session tab opened. Check the Codex extension in this window and retry.",
  "未知的 Codex 会话打开位置。": "Unknown Codex session opening location.",
  "当前 VS Code 环境不支持 Codex 会话侧栏跳转，请在通知设置中选择主编辑器。": "This VS Code environment does not support opening Codex sessions in the sidebar. Choose the main editor in notification settings.",
  "当前窗口的 Codex 侧栏不可用，请先安装并启用 Codex 扩展。": "The Codex sidebar is unavailable in this window. Install and enable the Codex extension first.",
  "未能聚焦目标窗口，保留未读。": "Could not focus the target window; the notification remains unread.",
  "目标窗口已失去焦点，已取消会话跳转并保留未读。": "The target window lost focus. Navigation was cancelled and the notification remains unread.",
  "跳转期间窗口焦点改变，无法确认目标，保留未读。": "Window focus changed during navigation. The target could not be confirmed; the notification remains unread.",
  "本轮已回复": "Reply finished",
  "等待批准": "Awaiting approval",
  "等待回答": "Awaiting an answer",
  "通知测试": "Notification test",
  "测试": "Tests",
  "聊天名称": "Chat title",
  "轮次": "Turn",
  "查看任务名称、模型与进度，展开查看用量和详情。": "See task names, models and progress; expand a task for usage and details.",
  "搜索任务名称、项目或模型": "Search task names, projects or models",
  "完成表示本轮回复结束；用量与估算费用见任务详情。": "Completion means this response ended; usage and estimated cost are in task details.",
  "未提供项目": "No project specified",
  "会话更新": "Session update",
  "未知来源": "Unknown source",
  "本窗口待处理": "Pending in this window",
  "其他窗口／未连接的待处理": "Pending in other/disconnected windows",
  "缓存保留天数必须为 1–30 的整数": "Cache retention must be an integer from 1 to 30 days",
  "通知存储目录包含链接或重定向，已停止清理": "Notification storage contains a link or redirection; cleanup stopped",
  "通知缓存包含链接或非普通文件，已停止清理": "Notification cache contains a link or non-regular file; cleanup stopped",
  "隐私控制文件异常；已停止接收通知": "Invalid privacy control file; notification receiving stopped",
  "采集缓存预览未通过；未清理数据。请查看当前环境状态。": "Collector cache preview failed; no data was cleared. Check the current environment status.",
  "本机：清理所有已连接窗口共享的通知历史、旧版本缓存和去重记录（约 {0} 字节）。": "Local machine: clear notification history, legacy caches, and deduplication records shared by all connected windows (about {0} bytes).",
  "当前环境：{0}\n清理已归属本扩展的采集缓存及审批提醒 Hook（约 {1} 字节）。": "Current environment: {0}\nClear this extension's collector cache and approval notification hook (about {1} bytes).",
  "本次不清理服务器或容器中的采集缓存。": "Collector caches on servers or in containers will not be cleared in this operation.",
  "其他服务器／容器需要分别连接后清理。清理后暂停本机通知接收；当前环境清理成功后也保持采集暂停。": "Connect to other servers/containers individually to clean them. Local notification receiving is paused after cleanup; collection in the current environment also remains paused after successful cleanup.",
  "保留原始 Codex 对话、登录信息、项目文件、无关 Hook，以及不含会话标识的最小暂停控制和本机通信身份。": "Original Codex conversations, sign-in information, project files, unrelated hooks, minimal pause controls without session IDs, and the local communication identity are retained.",
  "发现 {0} 份无法确认归属的旧 Hook 备份，将保留并在结果中列明。": "Found {0} legacy hook backups whose ownership cannot be confirmed. They will be retained and listed in the result.",
  "这是应用数据删除，不保证擦除磁盘恢复副本、系统日志或外部备份。": "This deletes application data; it does not guarantee erasure of recoverable disk copies, system logs, or external backups.",
  "清理通知数据并暂停采集？": "Clear notification data and pause collection?",
  "清理并暂停": "Clear and pause",
  "采集器未确认清理完成": "The collector did not confirm cleanup completion",
  "本机通知缓存和当前环境采集缓存已清理，接收和采集保持暂停。其他远端环境需分别清理。": "The local notification cache and current environment's collector cache were cleared. Receiving and collection remain paused. Clean other remote environments separately.",
  "本机通知缓存已清理并暂停接收；当前环境采集缓存未确认清理完成：": "The local notification cache was cleared and receiving is paused; cleanup of the current environment's collector cache was not confirmed: ",
  "。请重新预览后重试。": ". Preview again before retrying.",
  "本机全部通知缓存已清理并暂停接收。服务器／容器采集缓存未作清理。": "All local notification caches were cleared and receiving is paused. Server/container collector caches were not cleared.",
  "当前环境采集未恢复，本机保持暂停：": "Collection in the current environment did not resume; local receiving remains paused: ",
  "采集器未确认恢复完成": "The collector did not confirm resuming",
  "已恢复当前环境采集和本机通知接收。清理前的事件不会补回；审批提醒如已移除，需要重新配置并信任。": "Collection in the current environment and local notification receiving resumed. Events from before cleanup will not be replayed. If approval hooks were removed, configure and trust them again.",
  "阅读隐私说明": "Read the privacy notice",
  "数据范围、隔离边界、保留和清理": "Data scope, isolation, retention, and cleanup",
  "清理当前环境及本机通知数据": "Clear current environment and local notification data",
  "先预览；清理后暂停采集和接收": "Preview first; pause collection and receiving after cleanup",
  "仅清理本机全部通知缓存": "Clear all local notification caches only",
  "远端未连接时也可用": "Available even when the remote environment is disconnected",
  "恢复当前环境采集和本机接收": "Resume current environment collection and local receiving",
  "不会补回清理前的事件": "Does not replay events from before cleanup",
  "Codex 通知隐私与数据清理": "Codex Notification Privacy and Data Cleanup",
  "本机安全管道已关闭": "Local secure pipe closed",
  "本机管道发送队列过大": "Local pipe send queue exceeds its limit",
  "本机管道组件输出异常": "Invalid output from the local pipe component",
  "本机管道接收队列过大": "Local pipe receive queue exceeds its limit",
  "本机安全管道组件已退出：": "Local secure pipe component exited: ",
  "本机安全管道启动超时": "Local secure pipe startup timed out",
  "窗口任务栏组件响应超时": "Window taskbar component response timed out",
  "窗口标题闪动：": "Window title flashing: ",
  "窗口任务栏提示：": "Window taskbar attention: ",
  "当前 VS Code 不支持窗口标题标记": "This VS Code version does not support window title markers",
  "🔴 待处理": "🔴 Action needed",
  "🟡 本轮已回复": "🟡 Reply finished",
  "窗口标题标记未应用": "Window title marker was not applied",
  "无法唯一定位当前窗口；标题标记已保留，将稍后重试任务栏颜色": "Could not uniquely identify this window; the title marker is retained and taskbar coloring will be retried later",
  "请先在此窗口打开本地文件夹或工作区，再运行本地采集器。": "Open a local folder or workspace in this window before running the local collector.",
  "请先信任此工作区，再运行采集器或配置审批 Hook。": "Trust this workspace before running the collector or configuring approval hooks.",
  "隐私清理正在执行，请稍后重试。": "Privacy cleanup is in progress; please retry later.",
  "采集器命令超时；请检查 Python 和 Codex home 设置。": "Collector command timed out; check the Python and Codex Home settings.",
  "采集器返回内容超过允许大小。": "Collector output exceeds the size limit.",
  "无法运行 Python（{0}）。请检查 codexBeacon.{1}。": "Could not run Python ({0}). Check codexBeacon.{1}.",
  "启动失败": "Failed to start",
  "采集器命令失败（退出码 {0}）。请检查 Python、目录权限和 hooks.json 格式。": "Collector command failed (exit code {0}). Check Python, directory permissions, and the hooks.json format.",
  "采集器没有返回有效结果。": "The collector did not return a valid result.",
  "无法启动采集器命令（{0}）。": "Could not start the collector command ({0}).",
  "审批提醒 Hook 已配置。请在 Codex 设置 → Hooks → PermissionRequest 中核对 codex-beacon/remote_notifier.py，然后点击 Trust。扩展无法代替你信任 Hook。": "The approval notification hook is configured. In Codex Settings → Hooks → PermissionRequest, verify codex-beacon/remote_notifier.py and click Trust. This extension cannot trust the hook on your behalf.",
  "已移除此扩展管理的审批提醒 Hook；其他配置和备份已保留。": "The approval notification hook managed by this extension was removed; other settings and backups were retained.",
  "采集进程未及时退出；已暂停，未执行数据清理。": "The collector process did not exit in time; collection is paused and data cleanup was not performed.",
  "请先预览本环境的隐私清理清单，再确认清理。": "Preview this environment's privacy cleanup list before confirming cleanup.",
  "无法写入暂停设置；本进程及持久隐私暂停标记仍会阻止采集。": "Could not save the pause setting; this process and the persistent privacy pause marker still prevent collection.",
  "采集器已暂停。请启用 codexBeacon.{0} 后测试采集链路。": "The collector is paused. Enable codexBeacon.{0} before testing the collector connection.",
  "Collector is not started.": [
    "采集器尚未启动。",
    "Collector is not started."
  ],
  "Privacy cleanup paused collection; resume it explicitly to collect new notifications.": [
    "隐私清理后已暂停采集；手动恢复后才会采集新通知。",
    "Privacy cleanup paused collection; resume it explicitly to collect new notifications."
  ],
  "Open a local folder or workspace to start the local collector.": [
    "打开本地文件夹或工作区以启动本地采集器。",
    "Open a local folder or workspace to start the local collector."
  ],
  "Workspace is not trusted; collector processes and hook changes are disabled.": [
    "工作区尚未受信任；已禁用采集进程和 Hook 修改。",
    "Workspace is not trusted; collector processes and hook changes are disabled."
  ],
  "Collector disabled in settings.": [
    "已在设置中禁用采集器。",
    "Collector disabled in settings."
  ],
  "{0} Retrying in {1} seconds; check the Python path and Codex home.": [
    "{0} 将在 {1} 秒后重试；请检查 Python 路径和 Codex Home。",
    "{0} Retrying in {1} seconds; check the Python path and Codex home."
  ],
  "Starting Codex event collector.": [
    "正在启动 Codex 事件采集器。",
    "Starting Codex event collector."
  ],
  "Collector is reading Codex event metadata.": [
    "采集器正在读取 Codex 事件元数据。",
    "Collector is reading Codex event metadata."
  ],
  "Collector process could not start ({0}).": [
    "采集进程无法启动（{0}）。",
    "Collector process could not start ({0})."
  ],
  "spawn error": [
    "启动错误",
    "spawn error"
  ],
  "Collector exited ({0}).": [
    "采集器已退出（{0}）。",
    "Collector exited ({0})."
  ],
  "Notification data cleanup finished; collection remains paused.": [
    "通知数据清理完成；采集保持暂停。",
    "Notification data cleanup finished; collection remains paused."
  ],
  "Collector heartbeat timed out; restarting.": [
    "采集器心跳超时；正在重启。",
    "Collector heartbeat timed out; restarting."
  ],
  "Workspace collector closed.": [
    "工作区采集器已关闭。",
    "Workspace collector closed."
  ],
  "Codex Beacon — Collector": [
    "Codex 通知 · 采集器",
    "Codex Beacon — Collector"
  ],
  "Notification queue reached 500 entries; oldest pending event was dropped.": [
    "通知队列达到 500 条；已丢弃最早的待发送事件。",
    "Notification queue reached 500 entries; oldest pending event was dropped."
  ],
  "Local component did not acknowledge the event.": [
    "本机组件未确认接收此事件。",
    "Local component did not acknowledge the event."
  ],
  "Waiting for the local Codex Beacon component; retrying every 2 seconds.": [
    "正在等待本机 Codex 通知组件；每 2 秒重试。",
    "Waiting for the local Codex Beacon component; retrying every 2 seconds."
  ],
  "语言已切换为中文。": "Language changed to English.",
  "采集器语言已更新。": "Collector language updated.",
  "stopped": [
    "已停止",
    "stopped"
  ],
  "starting": [
    "正在启动",
    "starting"
  ],
  "connected": [
    "已连接",
    "connected"
  ],
  "error": [
    "错误",
    "error"
  ],
  "Window title controller is disposed": [
    "窗口标题组件已关闭",
    "Window title controller is disposed"
  ],
  "VS Code does not expose registerWindowTitleVariable": [
    "当前 VS Code 不提供窗口标题变量功能",
    "VS Code does not expose registerWindowTitleVariable"
  ],
  "window.title is not a string": [
    "window.title 设置不是文本",
    "window.title is not a string"
  ],
  "An overriding window.title setting prevents the notification prefix": [
    "覆盖的 window.title 设置阻止了通知前缀显示",
    "An overriding window.title setting prevents the notification prefix"
  ],
  "The window title template no longer contains the notification variable": [
    "窗口标题模板已不包含通知变量",
    "The window title template no longer contains the notification variable"
  ],
  "Window title binding is unavailable": [
    "窗口标题绑定不可用",
    "Window title binding is unavailable"
  ],
  "Window title prefix must be a string": [
    "窗口标题前缀必须为文本",
    "Window title prefix must be a string"
  ],
  "Invalid window binding marker": [
    "窗口绑定标记无效",
    "Invalid window binding marker"
  ],
  "Window binding callback is required": [
    "缺少窗口绑定回调",
    "Window binding callback is required"
  ],
  "Notification helper is closed": [
    "通知辅助组件已关闭",
    "Notification helper is closed"
  ],
  "Invalid notification helper output": [
    "通知辅助组件输出无效",
    "Invalid notification helper output"
  ],
  "Windows notification helper exited": [
    "Windows 通知辅助组件已退出",
    "Windows notification helper exited"
  ],
  "Windows notification helper did not acknowledge delivery": [
    "Windows 通知辅助组件未确认送达",
    "Windows notification helper did not acknowledge delivery"
  ],
  "Notification helper is shutting down": [
    "通知辅助组件正在关闭",
    "Notification helper is shutting down"
  ],
  "Native notifications require Windows; use the VS Code notification fallback": [
    "原生通知需要 Windows 支持",
    "Native notifications require Windows; use the VS Code notification fallback"
  ],
  "Window attention helper is closed": [
    "窗口提醒辅助组件已关闭",
    "Window attention helper is closed"
  ],
  "Window attention helper closed": [
    "窗口提醒辅助组件已关闭",
    "Window attention helper closed"
  ],
  "Invalid window attention response": [
    "窗口提醒组件响应无效",
    "Invalid window attention response"
  ],
  "Window attention helper exited": [
    "窗口提醒辅助组件已退出",
    "Window attention helper exited"
  ],
  "Windows could not create the notification icon": [
    "Windows 无法创建通知图标",
    "Windows could not create the notification icon"
  ],
  "Windows could not configure notification callbacks": [
    "Windows 无法配置通知回调",
    "Windows could not configure notification callbacks"
  ],
  "Windows rejected the notification": [
    "Windows 拒绝显示通知",
    "Windows rejected the notification"
  ],
  "Invalid window binding": [
    "窗口绑定无效",
    "Invalid window binding"
  ],
  "Unsupported VS Code executable": [
    "不支持此 VS Code 可执行程序",
    "Unsupported VS Code executable"
  ],
  "Could not lease the VS Code window handle": [
    "无法取得 VS Code 窗口句柄使用权",
    "Could not lease the VS Code window handle"
  ],
  "Invalid unread count": [
    "未读数量无效",
    "Invalid unread count"
  ],
  "Request too large": [
    "请求超过大小限制",
    "Request too large"
  ],
  "Unknown operation": [
    "未知操作",
    "Unknown operation"
  ],
  "Request must be an object": [
    "请求必须是对象",
    "Request must be an object"
  ],
  "Invalid requestId": [
    "请求标识无效",
    "Invalid requestId"
  ],
  "Invalid clientId": [
    "客户端标识无效",
    "Invalid clientId"
  ],
  "Unsupported authenticated broker protocol": [
    "不支持此通知组件认证协议",
    "Unsupported authenticated broker protocol"
  ],
  "Invalid notification language": [
    "通知语言无效",
    "Invalid notification language"
  ],
  "Invalid window metadata": [
    "窗口元数据无效",
    "Invalid window metadata"
  ],
  "Invalid notification policy": [
    "通知策略无效",
    "Invalid notification policy"
  ],
  "Window must belong to the authenticated client": [
    "窗口必须属于已认证客户端",
    "Window must belong to the authenticated client"
  ],
  "Invalid workspace roots": [
    "工作区根目录无效",
    "Invalid workspace roots"
  ],
  "Notification queue limit reached": [
    "通知队列已达到上限",
    "Notification queue limit reached"
  ],
  "Invalid keys": [
    "通知标识列表无效",
    "Invalid keys"
  ],
  "Invalid broker state": [
    "通知组件缓存状态无效",
    "Invalid broker state"
  ],
  "Unsupported event.version": [
    "不支持此事件版本",
    "Unsupported event.version"
  ],
  "Invalid event.type": [
    "事件类型无效",
    "Invalid event.type"
  ],
  "Invalid event.timestamp": [
    "事件时间戳无效",
    "Invalid event.timestamp"
  ],
  "IPC storage must not be a reparse point": [
    "通信存储不能是重解析点",
    "IPC storage must not be a reparse point"
  ],
  "IPC cache owner is not the current user": [
    "通信缓存所有者不是当前用户",
    "IPC cache owner is not the current user"
  ],
  "IPC cache must not have hard links": [
    "通信缓存不能包含硬链接",
    "IPC cache must not have hard links"
  ],
  "IPC storage owner is not the current user": [
    "通信存储所有者不是当前用户",
    "IPC storage owner is not the current user"
  ],
  "Unexpected directory in dedicated notification storage": [
    "通知专用存储中有未知目录",
    "Unexpected directory in dedicated notification storage"
  ],
  "IPC storage permissions are inherited": [
    "通信存储权限存在继承",
    "IPC storage permissions are inherited"
  ],
  "IPC storage grants another identity access": [
    "通信存储向其他身份授予了访问权限",
    "IPC storage grants another identity access"
  ],
  "IPC storage must be absolute": [
    "通信存储必须使用绝对路径",
    "IPC storage must be absolute"
  ],
  "IPC identity initialization timed out": [
    "通信身份初始化超时",
    "IPC identity initialization timed out"
  ],
  "Invalid IPC key file": [
    "通信密钥文件无效",
    "Invalid IPC key file"
  ],
  "Invalid or expired IPC identity": [
    "通信身份无效或已过期",
    "Invalid or expired IPC identity"
  ],
  "Invalid local IPC pipe name": [
    "本机通信管道名称无效",
    "Invalid local IPC pipe name"
  ],
  "IPC relay command too large": [
    "通信转发命令超过大小限制",
    "IPC relay command too large"
  ],
  "Invalid IPC relay command": [
    "通信转发命令无效",
    "Invalid IPC relay command"
  ],
  "Unexpected file in dedicated notification storage: ": [
    "通知专用存储中有未知文件：",
    "Unexpected file in dedicated notification storage: "
  ],
  "History migration failed: ": [
    "通知历史迁移失败：",
    "History migration failed: "
  ],
  "Notification broker: ": [
    "通知组件：",
    "Notification broker: "
  ],
  "旧版通知后台仍在运行。请在任务空闲后关闭所有 VS Code 窗口，等待 10 秒再重新打开，以启用原生通知语言切换。": "An older notification background process is still running. When tasks are idle, close all VS Code windows, wait 10 seconds, and reopen to enable native notification language switching."
};
let languageProvider = () => 'zh-CN';
function normalizeLanguage(value) { return value === 'en' ? 'en' : 'zh-CN'; }
function resolveLanguage(value, locale = 'zh-CN') {
  if (value === 'en' || value === 'zh-CN') return value;
  return /^zh(?:-|$)/i.test(locale) ? 'zh-CN' : 'en';
}
function configureLanguage(provider) { languageProvider = provider; }
function getLanguage() { return normalizeLanguage(languageProvider()); }
function message(input, ...values) {
  const key = Array.isArray(input) ? input.reduce((text, part, index) => text + (index ? `{${index - 1}}` : '') + part, '') : input;
  return {key, values};
}
function renderMessage(spec, language = getLanguage(), fallback = '') {
  if (!spec || typeof spec.key !== 'string' || !Object.hasOwn(MESSAGES, spec.key) || !Array.isArray(spec.values) || spec.values.length > 20) return fallback;
  const pair = MESSAGES[spec.key];
  const template = Array.isArray(pair) ? pair[normalizeLanguage(language) === 'en' ? 1 : 0] : normalizeLanguage(language) === 'en' ? pair : spec.key;
  return template.replace(/\{(\d+)\}/g, (placeholder, index) => {
    const value = spec.values[Number(index)];
    return value === undefined ? placeholder : String(value);
  });
}
function translator(language) {
  const selected = normalizeLanguage(language);
  return (input, ...values) => {
    const spec = message(input, ...values);
    return renderMessage(spec, selected, typeof input === 'string' ? input : spec.key.replace(/\{(\d+)\}/g, (_, i) => String(values[Number(i)])));
  };
}
function t(input, ...values) { return translator(getLanguage())(input, ...values); }
// Localize known diagnostics only at error/log boundaries. Unknown OS details stay verbatim.
function diagnostic(value, language = getLanguage(), depth = 0) {
  if (typeof value !== 'string' || depth > 4) return value;
  for (const [key, pair] of Object.entries(MESSAGES)) {
    const [zh, en] = Array.isArray(pair) ? pair : [key, pair];
    const result = normalizeLanguage(language) === 'en' ? en : zh;
    if (value === key || value === zh || value === en) return result;
    if (/[:：]\s*$/.test(en) && /[:：]\s*$/.test(zh)) {
      for (const prefix of [key, zh, en]) {
        if (value.startsWith(prefix)) return result + diagnostic(value.slice(prefix.length), language, depth + 1);
      }
    }
  }
  return value;
}
// An output channel keeps its name for the current VS Code host lifetime.
// Its messages always read the current setting; previously written lines remain intact.
module.exports = {t, getLanguage, configureLanguage, translator, normalizeLanguage, resolveLanguage, message, renderMessage, diagnostic, MESSAGES};
