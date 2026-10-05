param(
  [Parameter(Mandatory=$true)][string]$PoolUrl,
  [Parameter(Mandatory=$true)][string]$EntryName,
  [switch]$AutoPush,
  [switch]$InstallSchedules
)

$ErrorActionPreference='Stop'
$Repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Python=(Get-Command python -ErrorAction Stop).Source
$Server=Join-Path $Repo 'tools\cbs-bridge-server.py'
$Collector=Join-Path $Repo 'tools\cbs-collector.py'

Write-Host 'Configuring Sunday Funday IQ CBS automation...' -ForegroundColor Cyan
[Environment]::SetEnvironmentVariable('SFIQ_CBS_POOL_URL',$PoolUrl,'User')
[Environment]::SetEnvironmentVariable('SFIQ_CBS_ENTRY_NAME',$EntryName,'User')
[Environment]::SetEnvironmentVariable('SFIQ_AUTO_PUSH',$(if($AutoPush){'1'}else{'0'}),'User')
[Environment]::SetEnvironmentVariable('SFIQ_CBS_HEADLESS','0','User')
$env:SFIQ_CBS_POOL_URL=$PoolUrl
$env:SFIQ_CBS_ENTRY_NAME=$EntryName
$env:SFIQ_AUTO_PUSH=$(if($AutoPush){'1'}else{'0'})
$env:SFIQ_CBS_HEADLESS='0'

& $Python -m pip install --user playwright
& $Python -m playwright install chromium

$User="$env:USERDOMAIN\$env:USERNAME"
$ServerAction=New-ScheduledTaskAction -Execute $Python -Argument ('"'+$Server+'"') -WorkingDirectory $Repo
$ServerTrigger=New-ScheduledTaskTrigger -AtLogOn -User $User
$ServerSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName 'Sunday Funday IQ - CBS Automation Server' -Action $ServerAction -Trigger $ServerTrigger -Settings $ServerSettings -RunLevel Limited -Force | Out-Null

if($InstallSchedules){
  $RefreshAction=New-ScheduledTaskAction -Execute $Python -Argument ('"'+$Collector+'"') -WorkingDirectory $Repo
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
    Register-ScheduledTask -TaskName ("Sunday Funday IQ - CBS Refresh {0:D2}" -f $i) -Action $RefreshAction -Trigger $trigger -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable) -RunLevel Limited -Force | Out-Null
  }
}

Write-Host ''
Write-Host 'Base automation installed.' -ForegroundColor Green
Write-Host 'Next: run the one-time CBS login command:' -ForegroundColor Yellow
Write-Host ('  python "'+$Collector+'" --login')
Write-Host ''
Write-Host 'After the login is verified, test a refresh:' -ForegroundColor Yellow
Write-Host ('  python "'+$Collector+'"')
Write-Host ''
Write-Host 'Auto-push is currently:' $(if($AutoPush){'ON'}else{'OFF'})
Write-Host 'Scheduled refreshes installed:' $(if($InstallSchedules){'YES'}else{'NO'})
