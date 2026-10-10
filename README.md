# Codex Beacon · Codex 灯塔

为 VS Code 中的 Codex 提供任务完成提醒、声音、窗口状态标记和通知历史。

基于 [lengmo1996/codex-vscode-notifier](https://github.com/lengmo1996/codex-vscode-notifier) 的 MIT 开源项目，包含 Windows PowerShell 路径修复和安装辅助脚本。当前版本为主扩展 **0.4.3**、采集器 **0.2.5**。

## 当前功能

- Codex 每轮回复结束时提醒，可开启 Windows 弹窗与声音。
- 窗口标题和任务栏标记，帮助定位需要处理的窗口。
- 未读列表、通知历史、去重及会话跳转。
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
  "codexNotifier.notificationsEnabled": true,
  "codexNotifier.notifyOnDone": true,
  "codexNotifier.desktopNotifications": true,
  "codexNotifier.desktopOnDone": true,
  "codexNotifier.sound": true,
  "codexNotifier.soundOnDone": true
}
```

如 Python 不在启动器默认位置，还需在 `codexNotifier.localPythonPath` 中设置其完整路径。默认用户配置以外的 VS Code Profile 需要在该 Profile 中单独配置。

在任务空闲时运行“开发人员：重新加载窗口”。升级后若共享通知后台仍使用旧代码，可在任务空闲时关闭所有 VS Code 窗口，等待 10 秒后再打开。验证提醒可运行 **Codex 通知：测试本机弹窗和声音**。

Windows 勿扰模式、通知权限和静音设置可能影响实际提醒。首次启用任务栏状态时，扩展会在原 `window.title` 模板前加入 `${codexNotification}${separator}`。

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

## 后续方向

- 运行中、等待输入、回复结束等状态灯。
- 更多 AI 编程工具的状态与提醒整合。
- 统一的任务状态面板。

这些属于后续计划，当前版本尚未实现。

## 来源与许可

源代码基于上游提交 `4fa74775c65980a5015e0515b5877bc4ebe51e45`，保留原版权声明及 [MIT 许可证](LICENSE)。[UPSTREAM.md](UPSTREAM.md) 保存原项目介绍。

这是独立维护的衍生项目。为兼容现有本地安装，扩展 ID 暂时保留上游标识；本仓库没有向 VS Code 扩展市场发布新条目。请使用本仓库的构建包获取这里的修复。
