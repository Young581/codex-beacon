# Changelog

## 0.5.7

- 验证 Python 3.8+ 运行时后启动采集与 Hook 操作；Windows 优先使用真实安装，自动回退失败候选。
- 拒绝过旧或无法运行的 Python，提供明确处理步骤，保留用户显式路径、信任和隐私暂停。
- Validate Python runtimes and recover from unusable launcher targets before starting collection.

## 0.5.6

- 同步提示音音量的中文与英文界面资源，本机音量由主扩展控制。
- Synchronize volume-control translations used by the main extension.

## 0.5.5

- Synchronize localized sound-scenario labels for Beacon's completion, question and approval sound settings.

## 0.5.4

- Synchronize localized conversation and round labels for the redesigned Beacon dashboard and sidebar.

## 0.5.3

- Register the approval hook after healthy collection starts, preserving existing definitions and unrelated hooks under concurrent installs.
- Respect privacy pause and the environment's automatic setup setting; removing a hook disables automatic setup.
- Report hook registration status and instructions to the dashboard; Codex trust remains a user action.

## 0.5.2

- Keep asynchronous questions pending after the immediate acknowledgement; resume only on matching user replies or an actual answer result.
- Track multiple question indexes without retaining question or answer text; ignore duplicate, unrelated and late replies after completion.

## 0.5.1

- Detect Windows Python installations when the optional launcher is absent, while keeping explicit settings and Linux/macOS defaults.


## 0.4.0

- 按现有任务会话 ID 读取 Codex 聊天标题索引与只读 SQLite 名称字段，不读取消息列。
- 标题查询遵循工作区信任与隐私暂停，兼容缺失索引、旧格式和数据库暂时不可读。
- Read bounded Codex chat display names for requested task sessions, including current WAL updates.

## 0.3.5

- 同步测试分组与管理面板入口的中英文提示。
- Sync translations for test grouping and the dashboard entry point.

## 0.3.4

- 同步仪表盘中英文翻译；采集与任务统计逻辑保持不变。
- Sync dashboard translations; collection behavior is unchanged.

## 0.3.3

- 同步自定义提示音相关翻译，采集行为保持不变。音频仅在 Windows 主扩展本机播放。
- Sync custom-sound translations; audio playback stays in the local Windows UI.

## 0.3.2

- 采集器提示默认跟随 VS Code，仍支持主扩展指定中文／英文。
- 配套命令与设置提供独立中英文语言资源；采集与费用统计逻辑保持原样。

## 0.3.1

- 补充项目窗口恢复提示的中英文翻译，配合主扩展 0.5.1。
- Added translations for project-window recovery; collection behavior is unchanged.

## 0.3.0

- 采集任务开始、恢复、完成、中断、失败与 token 更新。
- 按轮次累计增量，区分模型、服务档位、缓存与推理 token；缺少基线标注部分统计。
- 保留 VS Code 来源过滤、有限读取及会话内容筛选。

## 0.2.5

- 新增公开 GitHub 仓库、双语首页、下载和问题反馈入口；运行逻辑与上一版本一致。
- Added the public GitHub repository, bilingual project page, downloads, and issue links. Runtime behavior is unchanged.

## 0.2.4

- 新增独立的中文／English 语言选择，默认中文；弹窗、日志和运行时说明随设置切换。切换不重启采集、不改变已读状态。
- Added independent Chinese/English runtime language selection, defaulting to Chinese. Popups, logs, and runtime labels follow the setting without restarting collection or changing read states.

- 补充完整中英文功能、安装、行为边界及隐私说明；命令和设置项增加双语解释。
- Add Chinese/English feature, installation, behavior and privacy documentation, with bilingual command labels and setting descriptions.
- 扩展身份、运行逻辑、设置默认值不变。 Extension identities, runtime behavior and setting defaults are unchanged.

# 0.2.2

- 显示名称改为“Codex 远端通知采集器（lengmo1996）”，修复市场显示名称占用错误。
- 扩展 ID、运行时代码和主扩展关联不变。

# 0.2.1

- 更换市场 ID 为 `lengmo1996.codex-notifier-collector`；原名称删除后已被市场永久保留。
- 采集程序、命令、配置和数据目录保持不变；安装前请卸载目标环境中的旧远端扩展，避免冲突。

# 0.2.0

- 新增通知缓存保留期、预览后清理和显式恢复；保留原始对话及无关配置。
- 补充隐私说明、共享账号边界与备份保留限制。

# Changelog

## 0.5.0

- Prepare Codex Beacon Collector as the independent companion to Codex Beacon.
- Use the codexBeacon command/settings namespace and separate hook ownership and caches.
- Add Marketplace branding and remote installation documentation.

## 0.1.1

- Restrict notifications to sessions whose first metadata record identifies codex_vscode; do not trust source=vscode alone.
- Revalidate hooks and legacy spool events, and attach verified provenance for UI 0.2.0 / broker v4.
- Keep subagent completion silent and retain explicit question/approval events.
- Do not activate in local windows; UI 0.2.0 embeds its own local collector.

## 0.1.0

- Initial private workspace collector.
