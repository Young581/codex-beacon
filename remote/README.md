# Codex Beacon Collector

Python 3.8+ is required in the collection environment. Installed runtimes are validated before use; Windows automatically tries another candidate when a runtime or launcher cannot start. Explicit Python settings remain authoritative. If no runtime works, the collector reports installation/configuration and restart steps. Python is not bundled or automatically downloaded.

[GitHub](https://github.com/Young581/codex-beacon) · [Issues](https://github.com/Young581/codex-beacon/issues)

## 中文

**Codex Beacon** 的远端采集组件，用于 Remote SSH 和容器中的 Codex 任务。本机 Windows 文件夹已由主扩展内置采集，此组件在本机窗口不启动。

- 主扩展：`Young581.codex-beacon`，在 Windows 本机安装。
- 本组件：`Young581.codex-beacon-collector`，在对应 SSH／容器中安装和启用。
- 远端要求 Python 3.8+、受信任文件夹和同一用户可读取的 Codex Home。

在目标远端窗口运行主扩展的 **检查／安装当前环境的组件**，在扩展页面选择安装到该 SSH／容器。离线安装可从 [Releases](https://github.com/Young581/codex-beacon/releases) 下载对应 VSIX。

本组件只处理通知和任务元数据，经已有 VS Code 连接传给 Windows 主扩展，不另建服务器、不复制聊天正文或登录信息。Codex Home 默认使用远端 `CODEX_HOME` 或 `~/.codex`；`codexBeacon.pythonPath` 可指定该环境的 Python，`codexBeacon.codexHome` 可指定 Codex Home。

状态、测试和重启操作也可在主扩展仪表盘的 **管理与设置** 页使用。完成／提问采集不要求配置 Hook；审批 Hook 在采集器正常启动后自动添加，用户需在 Codex 设置 → Hooks 中核对并信任。已有定义保持原样，手动移除会关闭自动添加；隐私暂停及未受信任工作区不会自动添加。

旧通知扩展应在任务空闲时先停用，避免重复采集。新组件拥有独立设置、缓存和审批 Hook 标识，不迁移旧通知历史；原始 Codex 会话保留。参阅 [迁移说明](https://github.com/Young581/codex-beacon/blob/main/docs/marketplace.md#migrating-local-installations)。

远端集成已进行自动化检查，本次没有真实 SSH／容器环境验证。此为社区扩展，基于 MIT [上游项目](https://github.com/lengmo1996/codex-vscode-notifier)，由 Young581 独立维护。[隐私说明](https://github.com/Young581/codex-beacon/blob/main/PRIVACY.md)。

## English

Remote SSH/container companion for **Codex Beacon**. Install `Young581.codex-beacon` on Windows and `Young581.codex-beacon-collector` in the target remote environment. Local collection is already included in the main extension; this companion is inactive in local windows.

Requires Python 3.8+, a trusted folder and access to that environment's Codex Home under the same user. Run **Check / install components for this environment** in the remote window, then install/enable the companion there. Set `codexBeacon.pythonPath` or `codexBeacon.codexHome` in remote settings if needed.

Only notification/task metadata crosses the existing VS Code connection. No developer server or telemetry; original Codex conversations are retained. Approval alerts require a separately configured and trusted hook. Disable older notifier collectors before enabling this component to avoid duplicate collection; settings, caches and hook ownership are independent.

Remote integration has automated checks but has not been verified against a live SSH/container host in this release. MIT licensed, independently maintained by Young581, based on the [upstream project](https://github.com/lengmo1996/codex-vscode-notifier).
