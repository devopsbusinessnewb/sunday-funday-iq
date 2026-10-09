$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:registrations = 0
$script:starts = 0
$script:mockTask = [pscustomobject]@{
    TaskName = 'Sunday Funday IQ - Auto Update'
    Principal = [pscustomobject]@{ LogonType = 'Password' }
    Actions = @([pscustomobject]@{
        Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $repo 'tools\sfiq-auto-update.ps1') + '"'
        WorkingDirectory = $repo
    })
}
function Get-ScheduledTask { param($TaskName, $TaskPath, $ErrorAction); return $script:mockTask }
function Register-ScheduledTask { $script:registrations++; throw 'Unexpected task replacement.' }
function Start-ScheduledTask { $script:starts++; throw 'Unexpected task launch.' }
& (Join-Path $repo 'tools\enable-sfiq-auto-update.ps1')
if ($script:registrations -ne 0 -or $script:starts -ne 0) { throw 'Unattended updater registration was not preserved.' }
Write-Host 'PASS: updater reinstall preserves unattended registration without a launch.'
$script:mockTask.Actions[0].Arguments = 'different action'
$rejected = $false
try { & (Join-Path $repo 'tools\enable-sfiq-auto-update.ps1') } catch { $rejected = $true }
if (-not $rejected -or $script:registrations -ne 0) { throw 'Unexpected unattended action was replaced.' }
Write-Host 'PASS: unexpected unattended updater action is rejected without replacement.'
$script:mockTask.TaskName = 'Sunday Funday IQ - CBS Automation Server'
$before = [Environment]::GetEnvironmentVariable('SFIQ_AUTO_PUSH', 'User')
$rejected = $false
try { & (Join-Path $repo 'tools\enable-cbs-production.ps1') } catch { $rejected = $true }
$after = [Environment]::GetEnvironmentVariable('SFIQ_AUTO_PUSH', 'User')
if (-not $rejected -or $script:registrations -ne 0 -or $before -ne $after) { throw 'Legacy production installer changed unattended setup.' }
Write-Host 'PASS: legacy production installer rejects unattended tasks before changing configuration.'
