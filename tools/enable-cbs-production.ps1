$ErrorActionPreference='Stop'
$Repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Python=(Get-Command python -ErrorAction Stop).Source
$PythonW=Join-Path (Split-Path $Python -Parent) 'pythonw.exe'
if(-not (Test-Path $PythonW)){ $PythonW=$Python }
$Server=Join-Path $Repo 'tools\cbs-bridge-server.py'
$Collector=Join-Path $Repo 'tools\cbs-collector.py'
$TaskPrefix='Sunday Funday IQ - CBS Refresh '

$PoolUrl=[Environment]::GetEnvironmentVariable('SFIQ_CBS_POOL_URL','User')
$EntryName=[Environment]::GetEnvironmentVariable('SFIQ_CBS_ENTRY_NAME','User')
if([string]::IsNullOrWhiteSpace($PoolUrl)){ throw 'SFIQ_CBS_POOL_URL is not configured. Run setup-cbs-mini-pc.ps1 first.' }
if([string]::IsNullOrWhiteSpace($EntryName)){ throw 'SFIQ_CBS_ENTRY_NAME is not configured. Run setup-cbs-mini-pc.ps1 first.' }

Write-Host 'Enabling CBS production automation...' -ForegroundColor Cyan
[Environment]::SetEnvironmentVariable('SFIQ_AUTO_PUSH','1','User')
[Environment]::SetEnvironmentVariable('SFIQ_CBS_HEADLESS','1','User')
$env:SFIQ_CBS_POOL_URL=$PoolUrl
$env:SFIQ_CBS_ENTRY_NAME=$EntryName
$env:SFIQ_AUTO_PUSH='1'
$env:SFIQ_CBS_HEADLESS='1'

$User="$env:USERDOMAIN\$env:USERNAME"
$ServerAction=New-ScheduledTaskAction -Execute $PythonW -Argument ('"'+$Server+'"') -WorkingDirectory $Repo
$ServerTrigger=New-ScheduledTaskTrigger -AtLogOn -User $User
$ServerSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName 'Sunday Funday IQ - CBS Automation Server' -Action $ServerAction -Trigger $ServerTrigger -Settings $ServerSettings -RunLevel Limited -Force | Out-Null

Get-ScheduledTask -TaskName "$TaskPrefix*" -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false
$RefreshAction=New-ScheduledTaskAction -Execute $PythonW -Argument ('"'+$Collector+'"') -WorkingDirectory $Repo
$times=@(
  @{Day='Thursday';At='5:00PM'},
  @{Day='Thursday';At='10:45PM'},
  @{Day='Sunday';At='6:00AM'},
  @{Day='Sunday';At='8:15AM'},
  @{Day='Sunday';At='10:30AM'},
  @{Day='Sunday';At='12:15PM'},
  @{Day='Sunday';At='3:30PM'},
  @{Day='Sunday';At='7:00PM'},
  @{Day='Monday';At='10:30PM'}
)
$i=0
foreach($slot in $times){
  $i++
  $trigger=New-ScheduledTaskTrigger -Weekly -DaysOfWeek $slot.Day -At $slot.At
  $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName ("$TaskPrefix{0:D2}" -f $i) -Action $RefreshAction -Trigger $trigger -Settings $settings -RunLevel Limited -Force | Out-Null
}

Stop-ScheduledTask -TaskName 'Sunday Funday IQ - CBS Automation Server' -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName 'Sunday Funday IQ - CBS Automation Server'
Start-Sleep -Seconds 3
$health=Invoke-RestMethod 'http://127.0.0.1:43128/health'
if(-not $health.ok -or -not $health.autoPush){ throw 'CBS automation server did not restart with auto-push enabled.' }

Write-Host 'Running one production validation refresh (headless + auto-push)...' -ForegroundColor Yellow
& $Python $Collector
if($LASTEXITCODE -ne 0){
  [Environment]::SetEnvironmentVariable('SFIQ_CBS_HEADLESS','0','User')
  throw 'Headless production validation failed. Headless mode was reverted to OFF; no schedules need to be removed.'
}

Write-Host ''
Write-Host 'CBS production automation is ON.' -ForegroundColor Green
Write-Host 'Auto-push: ON'
Write-Host 'Headless scheduled collection: ON'
Write-Host ('Scheduled refresh tasks: '+$times.Count)
Write-Host 'Server runs quietly via pythonw.exe.'
Write-Host 'Next phase: phone-triggered refresh + app status.'
