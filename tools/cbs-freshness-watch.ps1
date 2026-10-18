$ErrorActionPreference='Stop'
$Repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Live=Join-Path $Repo 'data\live\cbs-pickem.json'
$Now=Get-Date

# The existing silent updater runs every 15 minutes. This watch turns that
# already-installed task into a CBS freshness keeper without creating another
# Windows task or requiring the phone to be open.
function Get-MaxAgeMinutes {
  param([datetime]$When)
  $day=[int]$When.DayOfWeek
  $hour=$When.Hour
  # During NFL decision/game windows, a 30-minute ceiling means the 15-minute
  # updater normally refreshes on the next cycle after the snapshot crosses it.
  if($day -eq 4 -and $hour -ge 16){ return 30 } # Thursday evening
  if($day -eq 6 -and $hour -ge 16){ return 30 } # Saturday decision window
  if($day -eq 0 -and $hour -ge 6){ return 30 }  # Sunday
  if($day -eq 1 -and $hour -ge 16){ return 30 } # Monday evening
  if($day -eq 2){ return 720 }                  # Tuesday: low-change day
  return 120                                    # Other lower-change windows
}

function Get-PublishedAgeMinutes {
  if(-not (Test-Path $Live)){ return [double]::PositiveInfinity }
  try{
    $payload=Get-Content -LiteralPath $Live -Raw | ConvertFrom-Json
    if(-not $payload.exportedAt){ return [double]::PositiveInfinity }
    $stamp=[DateTimeOffset]::Parse([string]$payload.exportedAt)
    return ([DateTimeOffset]::Now-$stamp).TotalMinutes
  }catch{
    return [double]::PositiveInfinity
  }
}

# Never overlap another collection. The bridge also enforces its own lock.
try{
  $status=Invoke-RestMethod 'http://127.0.0.1:43128/status' -TimeoutSec 4
}catch{
  exit 0
}
if(-not $status.ok -or $status.refreshing){ exit 0 }
try{
  $collectorActive=[bool]@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
    [string]$_.CommandLine -match '(?i)cbs-collector\.py'
  }).Count
}catch{ $collectorActive=$false }
if($collectorActive){ exit 0 }

$maxAge=Get-MaxAgeMinutes $Now
$age=Get-PublishedAgeMinutes
if($age -lt $maxAge){ exit 0 }

try{
  $start=Invoke-RestMethod 'http://127.0.0.1:43128/refresh' -Method Post -TimeoutSec 8
  if(-not $start.ok){ exit 1 }
}catch{
  # The main updater/bridge health recovery owns repair. Do not create a noisy
  # failure loop merely because a refresh could not be started this cycle.
  exit 0
}
