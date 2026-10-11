param([string]$CodeCommand, [string]$PythonPath)
$ErrorActionPreference = 'Stop'

if (-not $CodeCommand) {
    $runningCode = Get-Process -Name Code -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -First 1 -ExpandProperty Path
    $candidates = @()
    if ($runningCode) { $candidates += Join-Path (Split-Path $runningCode) 'bin/code.cmd' }
    $candidates += Join-Path $env:LOCALAPPDATA 'Programs/Microsoft VS Code/bin/code.cmd'
    $CodeCommand = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $CodeCommand -or -not (Test-Path -LiteralPath $CodeCommand)) { throw 'Specify -CodeCommand with the Microsoft VS Code bin/code.cmd path.' }
if (-not $PythonPath) {
    $pythonRoot = Join-Path $env:LOCALAPPDATA 'Programs/Python'
    if (Test-Path -LiteralPath $pythonRoot) {
        $PythonPath = Get-ChildItem -LiteralPath $pythonRoot -Filter python.exe -Recurse | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
    }
}
if (-not $PythonPath -or -not (Test-Path -LiteralPath $PythonPath)) { throw 'Specify -PythonPath with a Python 3.8+ executable.' }
$settings = Join-Path $env:APPDATA 'Code/User/settings.json'
$configuration = Join-Path $PSScriptRoot 'configure-notifications.py'
& $PythonPath -B $configuration --settings $settings --check
if ($LASTEXITCODE -ne 0) { throw 'Settings validation failed; nothing installed.' }

foreach ($package in @('codex-beacon-collector-0.5.5.vsix', 'codex-beacon-0.8.7.vsix')) {
    $archive = Join-Path $PSScriptRoot "dist/$package"
    if (-not (Test-Path -LiteralPath $archive)) { throw "Missing archive: $package" }
    # Windows PowerShell treats native stderr warnings as terminating errors
    # under Stop; the CLI exit status determines whether installation failed.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $CodeCommand --install-extension $archive --force --do-not-include-pack-dependencies
        $installationExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    if ($installationExit -ne 0) { throw "Extension installation failed: $package" }
}
& $PythonPath -B $configuration --settings $settings
if ($LASTEXITCODE -ne 0) { throw 'Extensions installed, but settings could not be configured.' }
Write-Output 'Installed. In VS Code, run Developer: Reload Window when convenient.'
