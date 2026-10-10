# Explicit local setup only. Never called by the automatic updater. Never reboots Windows.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'cbs-task-definition.ps1')
. (Join-Path $PSScriptRoot 'cbs-setup-diagnostics.ps1')
. (Join-Path $PSScriptRoot 'cbs-refresh-verification.ps1')
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Open PowerShell as Administrator under the existing CBS Windows account.'
}
$serverName = 'Sunday Funday IQ - CBS Automation Server'
$names = @($serverName) + @(1..9 | ForEach-Object { 'Sunday Funday IQ - CBS Refresh {0:D2}' -f $_ }) + @('Sunday Funday IQ - Auto Update')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$scheduler = New-Object -ComObject 'Schedule.Service'
$scheduler.Connect()
$folder = $scheduler.GetFolder('\')
if ($folder.GetTask($serverName).State -ne 4) { throw 'CBS server task must be running before setup; no tasks changed.' }
$originals = @($names | ForEach-Object {
    $task = $folder.GetTask($_)
    if (-not $task.Enabled) { throw 'An expected CBS task is disabled; no tasks changed.' }
    if ($task.Definition.Principal.LogonType -ne 3) { throw 'An expected task is not interactive; no tasks changed. Do not rerun a completed migration.' }
    if ((Get-CbsIdentitySid $task.Definition.Principal.UserId) -ne $identity.User.Value) {
        throw 'CBS tasks must use the current Windows account; no tasks changed.'
    }
    [pscustomobject]@{ Name = $_; Xml = $task.Xml; Definition = $task.Definition }
})
function Assert-CbsIdle {
    $current = Invoke-RestMethod 'http://127.0.0.1:43128/status' -TimeoutSec 10
    if (-not $current.ok -or $current.refreshing) { throw 'CBS is unavailable or refreshing; setup deferred.' }
    foreach ($name in $names | Where-Object { $_ -ne $serverName }) {
        if ($folder.GetTask($name).State -eq 4) { throw 'A refresh or updater is running; setup deferred.' }
    }
}
function Test-CbsBridgeResponding {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:43128/health' -TimeoutSec 1
        return [bool]$health.ok
    } catch { return $false }
}
function Stop-CbsVerifiedBridgeListener {
    $expectedScript = Join-Path $repo 'tools\cbs-bridge-server.py'
    $listeners = @(Get-NetTCPConnection -LocalPort 43128 -State Listen -ErrorAction SilentlyContinue)
    foreach ($processId in @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)) {
        $process = Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$processId)
        $commandLine = [string]$process.CommandLine
        $validName = [string]$process.Name -match '^pythonw?\.exe$'
        $validCommand = $commandLine.IndexOf($expectedScript, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
        if (-not $validName -or -not $validCommand) {
            throw 'Port 43128 is owned by an unexpected process. It was not stopped.'
        }
        Stop-Process -Id ([int]$processId) -Force
    }
}
Assert-CbsIdle
$credential = Get-Credential -UserName $identity.Name -Message 'Existing CBS Windows account PASSWORD (not Windows Hello PIN). Enter locally; never send it through chat.'
if ($null -eq $credential) { throw 'Credential entry cancelled; no tasks changed.' }
if ((Get-CbsIdentitySid $credential.UserName) -ne $identity.User.Value) { throw 'Credential identity differs from CBS account; no tasks changed.' }
$staged = @($originals | ForEach-Object {
    [pscustomobject]@{ Name = $_.Name; Xml = ConvertTo-CbsUnattendedDefinition -Xml $_.Xml -Server:($_.Name -eq $serverName) }
})
Assert-CbsIdle
$backup = Join-Path 'C:\Server\Backups\CBS-Tasks' ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
& icacls.exe $backup /inheritance:r /grant:r ('*' + $identity.User.Value + ':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict task backup access; no tasks changed.' }
$entries = @()
for ($index = 0; $index -lt $originals.Count; $index++) {
    $file = 'task-{0:D2}.xml' -f $index
    [System.IO.File]::WriteAllText((Join-Path $backup $file), $originals[$index].Xml)
    $entries += [pscustomobject]@{ Name = $originals[$index].Name; File = $file }
}
@{ SchemaVersion = 1; Tasks = $entries } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $backup 'manifest.json') -Encoding UTF8
Write-Host "Task backup: $backup"
$changed = $false
$serverStopped = $false
$registrationsStarted = $false
$password = $null
$verificationEvidence = @{}
$phase = 'FenceTasks'
try {
    # Fence scheduled launches; recheck before interrupting the idle bridge.
    $changed = $true
    foreach ($name in $names) { $folder.GetTask($name).Enabled = $false }
    Assert-CbsIdle
    $phase = 'StopServer'
    $folder.GetTask($serverName).Stop(0)
    $serverStopped = $true
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        if ($folder.GetTask($serverName).State -ne 4) { break }
        Start-Sleep -Seconds 1
    }
    if ($folder.GetTask($serverName).State -eq 4) { throw 'CBS server did not stop.' }
    # A prior task registration can report stopped while a detached pythonw listener survives.
    # Terminate only the verified CBS bridge command, then prove the old listener is gone.
    if (Test-CbsBridgeResponding) { Stop-CbsVerifiedBridgeListener }
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        if (-not (Test-CbsBridgeResponding)) { break }
        Start-Sleep -Seconds 1
    }
    if (Test-CbsBridgeResponding) { throw 'The previous CBS bridge listener did not stop.' }
    $password = $credential.GetNetworkCredential().Password
    $phase = 'RegisterTasks'
    $registrationsStarted = $true
    foreach ($item in $staged) {
        $folder.RegisterTask($item.Name, $item.Xml, 6, $credential.UserName, $password, 1, $null) | Out-Null
    }
    $phase = 'StartServer'
    $folder.GetTask($serverName).Enabled = $true
    $folder.GetTask($serverName).Run($null) | Out-Null
    $phase = 'CheckHealth'
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:43128/health' -TimeoutSec 2
            $status = Invoke-RestMethod 'http://127.0.0.1:43128/status' -TimeoutSec 2
            if ($health.ok -and $health.autoPush -and $health.stateRecoveryVersion -eq 1 -and $status.PSObject.Properties.Name -contains 'collector') { $ready = $true; break }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'CBS did not become ready in unattended context.' }
    Write-Host 'Checking authenticated collection and publication in unattended context...'
    $phase = 'CollectAndPublish'
    $status = Invoke-CbsRefreshVerification -Evidence $verificationEvidence
    $phase = 'ConfirmSnapshot'
    $snapshotCommit = (& git -C $repo log -1 --format=%H -- data/live/cbs-pickem.json).Trim()
    if ($LASTEXITCODE -ne 0 -or $snapshotCommit -notmatch '^[0-9a-f]{40}$') { throw 'Cannot verify snapshot commit.' }
    & git -C $repo fetch origin main --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify publication.' }
    & git -C $repo merge-base --is-ancestor $snapshotCommit origin/main
    if ($LASTEXITCODE -ne 0) { throw 'Snapshot publication not confirmed.' }
    $phase = 'EnableSchedules'
    foreach ($name in $names) { $folder.GetTask($name).Enabled = $true }
    [pscustomobject]@{ UnattendedCollection = 'Verified'; SnapshotCommit = $snapshotCommit; TaskCount = $names.Count; BackupDirectory = $backup; RebootBeforeSignIn = 'Still requires a controlled reboot test'; WindowsRebooted = $false } | Format-List
} catch {
    $failure = $_
    $httpStatus = 0
    try { $httpStatus = [int]$failure.Exception.Response.StatusCode } catch { }
    $failureStatus = $null
    try { $failureStatus = Invoke-RestMethod 'http://127.0.0.1:43128/status' -TimeoutSec 5 } catch { }
    $report = Get-CbsSetupFailureReport -Phase $phase -FailureText $failure.Exception.Message -BridgeStatus $failureStatus -HttpStatus $httpStatus
    Write-Host 'CBS setup failure details (sanitized):' -ForegroundColor Yellow
    $report | Add-Member -NotePropertyName ExceptionType -NotePropertyValue $failure.Exception.GetType().FullName
    $report | Add-Member -NotePropertyName ExceptionHResult -NotePropertyValue $failure.Exception.HResult
    foreach ($key in $verificationEvidence.Keys) {
        $report | Add-Member -NotePropertyName $key -NotePropertyValue $verificationEvidence[$key]
    }
    $report | Format-List | Out-Host
    try {
        $report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'failure-report.json') -Encoding UTF8
    } catch { Write-Host 'Could not save failure report; details are displayed above.' }
    if ($changed) {
        try {
            if ($registrationsStarted) {
                & (Join-Path $PSScriptRoot 'restore-cbs-task-backup.ps1') -BackupDirectory $backup
            } else {
                # An idle check failed before migration: restore only enablement,
                # preserving any refresh that started before the fence closed.
                foreach ($name in $names) { $folder.GetTask($name).Enabled = $true }
                if ($serverStopped) { $folder.GetTask($serverName).Run($null) | Out-Null }
            }
        } catch {
            throw "CBS migration and automatic rollback failed. Restore from $backup using tools\restore-cbs-task-backup.ps1. Do not reboot."
        }
    }
    throw 'CBS unattended setup did not complete; original interactive task definitions restored. Do not reboot for validation yet.'
} finally {
    $password = $null
    $credential = $null
}
