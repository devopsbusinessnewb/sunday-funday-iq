# Read-only: no task changes, credentials, process restarts, or file writes.
$ErrorActionPreference = 'Stop'
$ServerName = 'Sunday Funday IQ - CBS Automation Server'
$UpdaterName = 'Sunday Funday IQ - Auto Update'
function Get-AccountSid([string]$Account) {
    if ($Account -match '^S-1-') { return $Account }
    return ([System.Security.Principal.NTAccount]::new($Account)).Translate(
        [System.Security.Principal.SecurityIdentifier]).Value
}
$server = Get-ScheduledTask -TaskName $ServerName -TaskPath '\'
$serverSid = Get-AccountSid $server.Principal.UserId
$refresh = @(Get-ScheduledTask -TaskPath '\' |
    Where-Object { $_.TaskName -match '^Sunday Funday IQ - CBS Refresh [0-9]{2}$' })
$updater = @(Get-ScheduledTask -TaskName $UpdaterName -TaskPath '\' -ErrorAction SilentlyContinue)
$tasks = @($server) + $refresh + $updater
$rows = @($tasks | ForEach-Object {
    $task = $_
    $info = Get-ScheduledTaskInfo -TaskName $task.TaskName -TaskPath $task.TaskPath
    $sameAccount = (Get-AccountSid $task.Principal.UserId) -eq $serverSid
    $bootTrigger = @($task.Triggers | Where-Object {
        $_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger'
    }).Count -gt 0
    [pscustomobject]@{
        Name = $task.TaskName
        State = [string]$task.State
        LogonType = [string]$task.Principal.LogonType
        SameAccountAsServer = $sameAccount
        BootTrigger = $bootTrigger
        StartWhenAvailable = [bool]$task.Settings.StartWhenAvailable
        MultipleInstances = [string]$task.Settings.MultipleInstances
        ExecutionTimeLimit = $task.Settings.ExecutionTimeLimit
        LastTaskResult = ('0x{0:X8}' -f [uint32]$info.LastTaskResult)
    }
})
$bridgeReachable = $false
$busy = $null
$collectorOutcome = $null
try {
    $status = Invoke-RestMethod 'http://127.0.0.1:43128/status' -TimeoutSec 10
    $bridgeReachable = [bool]$status.ok
    $busy = [bool]$status.refreshing
    $collectorOutcome = $status.collector.outcome
} catch {
    # Report unavailable without exposing response bodies or exception messages.
}
[pscustomobject]@{
    CapturedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    ServerAccount = $server.Principal.UserId
    RefreshTaskCount = $refresh.Count
    UpdaterInstalled = ($updater.Count -eq 1)
    SameAccountForAllTasks = (@($rows | Where-Object { -not $_.SameAccountAsServer }).Count -eq 0)
    BridgeReachable = $bridgeReachable
    BridgeRefreshing = $busy
    CollectorOutcome = $collectorOutcome
    Tasks = $rows
    RebootBeforeSignInVerified = $false
} | ConvertTo-Json -Depth 5
