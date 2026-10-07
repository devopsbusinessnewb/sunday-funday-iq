param(
  [switch]$ResetAuth,
  [switch]$SkipSchedules
)

$ErrorActionPreference='Stop'
$Repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Yahoo=Join-Path $Repo 'tools\yahoo-sync.ps1'
$Runner=Join-Path $Repo 'tools\run-yahoo-sync.ps1'
$ServerRoot='C:\Server'
$LogDir=Join-Path $ServerRoot 'Logs\SundayFundayIQ\Yahoo'
$PrivateDir=Join-Path $env:USERPROFILE '.sunday-funday-iq'
$CredPath=Join-Path $PrivateDir 'yahoo-credentials.json'
$TokenPath=Join-Path $PrivateDir 'yahoo-oauth.json'

if(-not (Test-Path $Yahoo)){throw 'tools\yahoo-sync.ps1 not found.'}
if(-not (Test-Path $Runner)){throw 'tools\run-yahoo-sync.ps1 not found.'}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ServerRoot 'Temp') | Out-Null

Write-Host 'Configuring Sunday Funday IQ Yahoo automation...' -ForegroundColor Cyan
Write-Host ('Repository: '+$Repo)
Write-Host ('Logs: '+$LogDir)
Write-Host ''

if($ResetAuth){
  Write-Host 'Clearing old Yahoo OAuth state so the newly-live Yahoo app can be authorized.' -ForegroundColor Yellow
  Remove-Item $CredPath -Force -ErrorAction SilentlyContinue
  Remove-Item $TokenPath -Force -ErrorAction SilentlyContinue
}

Write-Host 'Running one interactive Yahoo API validation.' -ForegroundColor Yellow
Write-Host 'If prompted, enter the Client ID and Client Secret on THIS mini-PC.' -ForegroundColor Yellow
Write-Host 'Do not paste those credentials into ChatGPT or GitHub.' -ForegroundColor DarkYellow
Write-Host ''
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Yahoo -Season 2026 -Week 0
if($LASTEXITCODE -ne 0){throw 'Yahoo API validation failed. Scheduled automation was not installed.'}

Write-Host ''
Write-Host 'Yahoo API validation succeeded.' -ForegroundColor Green

if(-not $SkipSchedules){
  $TaskPrefix='Sunday Funday IQ - Yahoo Refresh '
  Get-ScheduledTask -TaskName "$TaskPrefix*" -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false

  $Action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$Runner+'"') -WorkingDirectory $Repo
  $Settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 5)

  $times=@(
    @{Day='Monday';At='6:00AM'},
    @{Day='Monday';At='12:00PM'},
    @{Day='Monday';At='6:00PM'},
    @{Day='Tuesday';At='6:00AM'},
    @{Day='Tuesday';At='12:00PM'},
    @{Day='Tuesday';At='6:00PM'},
    @{Day='Wednesday';At='6:00AM'},
    @{Day='Wednesday';At='12:00PM'},
    @{Day='Wednesday';At='6:00PM'},
    @{Day='Thursday';At='6:00AM'},
    @{Day='Thursday';At='12:00PM'},
    @{Day='Thursday';At='6:00PM'},
    @{Day='Friday';At='6:00AM'},
    @{Day='Friday';At='12:00PM'},
    @{Day='Friday';At='6:00PM'},
    @{Day='Saturday';At='6:00AM'},
    @{Day='Saturday';At='12:00PM'},
    @{Day='Saturday';At='6:00PM'},
    @{Day='Sunday';At='6:00AM'},
    @{Day='Sunday';At='9:00AM'},
    @{Day='Sunday';At='12:00PM'},
    @{Day='Sunday';At='3:00PM'},
    @{Day='Sunday';At='6:00PM'},
    @{Day='Sunday';At='9:00PM'}
  )

  $i=0
  foreach($slot in $times){
    $i++
    $Trigger=New-ScheduledTaskTrigger -Weekly -DaysOfWeek $slot.Day -At $slot.At
    Register-ScheduledTask -TaskName ("$TaskPrefix{0:D2}" -f $i) -Action $Action -Trigger $Trigger -Settings $Settings -RunLevel Limited -Force | Out-Null
  }

  Write-Host ('Installed '+$times.Count+' Yahoo refresh schedules.') -ForegroundColor Green
}

Write-Host ''
Write-Host 'Running one production publish test...' -ForegroundColor Yellow
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Runner
if($LASTEXITCODE -ne 0){throw 'Yahoo production publish test failed. Review C:\Server\Logs\SundayFundayIQ\Yahoo.'}

Write-Host ''
Write-Host 'Yahoo mini-PC automation is ready.' -ForegroundColor Green
Write-Host 'Private credentials/tokens remain under %USERPROFILE%\.sunday-funday-iq.'
Write-Host 'Sanitized output publishes to data\live\yahoo.json.'
Write-Host 'Logs are written to C:\Server\Logs\SundayFundayIQ\Yahoo.'
