$ErrorActionPreference='Stop'
$Repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Updater=Join-Path $Repo 'tools\sfiq-auto-update.ps1'
if(-not (Test-Path $Updater)){ throw 'sfiq-auto-update.ps1 is missing.' }

$TaskName='Sunday Funday IQ - Auto Update'
$PowerShell=(Get-Command powershell.exe -ErrorAction Stop).Source
$Args='-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$Updater+'"'
$Action=New-ScheduledTaskAction -Execute $PowerShell -Argument $Args -WorkingDirectory $Repo
$Trigger=New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 15)
$Settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -Hidden
$User="$env:USERDOMAIN\$env:USERNAME"
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -RunLevel Limited -User $User -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host 'Sunday Funday IQ silent auto-update is ON.' -ForegroundColor Green
Write-Host 'Checks GitHub every 15 minutes and only restarts the CBS service when service code changed.'
Write-Host 'Runs hidden; no PowerShell or Chrome window should appear during normal updates.'
