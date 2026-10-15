$ErrorActionPreference='Stop'
$Repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$LogDir=[Environment]::GetEnvironmentVariable('SFIQ_LOG_DIR','User')
if([string]::IsNullOrWhiteSpace($LogDir)){ $LogDir='C:\Server\Logs' }
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log=Join-Path $LogDir 'sfiq-auto-update.log'
function Write-Log([string]$Message){
  Add-Content -Path $Log -Value ((Get-Date).ToString('s')+' '+$Message)
}
function Get-CbsBridgeHealth {
  try {
    $health=Invoke-RestMethod 'http://127.0.0.1:43128/health' -TimeoutSec 4
    $status=Invoke-RestMethod 'http://127.0.0.1:43128/status' -TimeoutSec 4
    return [pscustomobject]@{ Healthy=[bool]$health.ok; Refreshing=[bool]$status.refreshing; Health=$health; Status=$status }
  } catch {
    return [pscustomobject]@{ Healthy=$false; Refreshing=$false; Health=$null; Status=$null }
  }
}
function Test-CbsCollectorProcess {
  try {
    return [bool]@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
      [string]$_.CommandLine -match '(?i)cbs-collector\.py'
    }).Count
  } catch { return $false }
}
function Restart-CbsBridge([string]$Reason){
  $task='Sunday Funday IQ - CBS Automation Server'
  $server=Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
  if(-not $server){ Write-Log ("CBS recovery needed ($Reason), but the server task is not installed."); return $false }
  if(Test-CbsCollectorProcess){ Write-Log ("Deferred CBS bridge recovery ($Reason): collector process is active."); return $false }
  Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Start-ScheduledTask -TaskName $task
  for($attempt=0;$attempt -lt 12;$attempt++){
    Start-Sleep -Seconds 1
    $probe=Get-CbsBridgeHealth
    if($probe.Healthy){ Write-Log ("CBS bridge recovered successfully ($Reason)."); return $true }
  }
  Write-Log ("CBS bridge restart attempted but health did not recover ($Reason).")
  return $false
}

try{
  Set-Location $Repo
  $dirty=(& git status --porcelain 2>$null)
  if($LASTEXITCODE -ne 0){ throw 'git status failed' }
  if($dirty){ Write-Log 'Skipped update because the repository has local changes.'; exit 0 }

  # Never update/restart while a scheduled collector is active.
  $active=@(Get-ScheduledTask -TaskName 'Sunday Funday IQ - CBS Refresh *' -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Running' })
  if($active.Count -gt 0){ Write-Log 'Deferred update: scheduled CBS collection is active.'; exit 0 }
  if(Test-CbsCollectorProcess){ Write-Log 'Deferred update: CBS collector process is active.'; exit 0 }

  $before=Get-CbsBridgeHealth
  if($before.Refreshing){ Write-Log 'Deferred update: bridge CBS collection is active.'; exit 0 }

  & git fetch origin main --quiet
  if($LASTEXITCODE -ne 0){ throw 'git fetch origin main failed' }
  $local=(& git rev-parse HEAD).Trim()
  $remote=(& git rev-parse origin/main).Trim()
  $changed=@()

  if($local -ne $remote){
    & git merge-base --is-ancestor $local $remote 2>$null
    if($LASTEXITCODE -ne 0){
      Write-Log ("Skipped non-fast-forward update. local=$local remote=$remote")
      if(-not $before.Healthy){ Restart-CbsBridge 'bridge unhealthy while update was non-fast-forward' | Out-Null }
      exit 0
    }
    $changed=@(& git diff --name-only $local $remote)
    & git merge --ff-only origin/main --quiet
    if($LASTEXITCODE -ne 0){ throw 'git fast-forward merge failed' }
    Write-Log ("Fast-forwarded to $remote.")
  }

  $serviceFiles=@('tools/cbs-bridge-server.py','tools/cbs-collector.py','tools/cbs-worker-runtime.py','tools/enable-cbs-production.ps1','tools/sfiq-auto-update.ps1')
  $serviceChanged=[bool]@($changed | Where-Object { $_ -in $serviceFiles }).Count
  $after=Get-CbsBridgeHealth

  if($serviceChanged){
    Restart-CbsBridge 'CBS service code changed' | Out-Null
  } elseif(-not $after.Healthy){
    Restart-CbsBridge 'bridge health check failed' | Out-Null
  } elseif($local -eq $remote){
    # Healthy and current: nothing to do.
    exit 0
  } else {
    Write-Log 'Repository updated; no CBS service restart required.'
  }
}catch{
  Write-Log ('Update error: '+$_.Exception.Message)
  exit 1
}
