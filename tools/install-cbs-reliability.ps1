# Apply after a clean fast-forward to main. No credentials or task logon changes.
$ErrorActionPreference='Stop'
$Repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Task='Sunday Funday IQ - CBS Automation Server'
$Python=(Get-Command python -ErrorAction Stop).Source
$status=Invoke-RestMethod 'http://127.0.0.1:43128/status' -TimeoutSec 10
if($status.refreshing){ throw 'CBS refresh is active. Installation deferred.' }
$active=@(Get-ScheduledTask -TaskName 'Sunday Funday IQ - CBS Refresh *' -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Running' })
if($active.Count){ throw 'Scheduled CBS refresh is active. Installation deferred.' }
$serverTask=Get-ScheduledTask -TaskName $Task
if($serverTask.State -ne 'Running'){ throw 'CBS server task must be running before installation.' }
Push-Location $Repo
try{
  & $Python -m unittest discover -s tests -p test_cbs_worker_runtime.py -v
  if($LASTEXITCODE -ne 0){ throw 'Windows lifecycle validation failed; no restart attempted.' }
  & $Python -m py_compile tools/cbs-worker-runtime.py tools/cbs-collector.py tools/cbs-bridge-server.py
  if($LASTEXITCODE -ne 0){ throw 'Syntax validation failed; no restart attempted.' }
  # Recheck immediately before restart; defer rather than interrupt known work.
  $status=Invoke-RestMethod 'http://127.0.0.1:43128/status' -TimeoutSec 10
  if($status.refreshing){ throw 'CBS refresh started during validation. Installation deferred.' }
  $active=@(Get-ScheduledTask -TaskName 'Sunday Funday IQ - CBS Refresh *' -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Running' })
  if($active.Count){ throw 'Scheduled refresh started during validation. Installation deferred.' }
  Stop-ScheduledTask -TaskName $Task
  Start-Sleep -Seconds 2
  Start-ScheduledTask -TaskName $Task
  $ready=$false
  for($attempt=0;$attempt -lt 15;$attempt++){
    try{
      $health=Invoke-RestMethod 'http://127.0.0.1:43128/health' -TimeoutSec 2
      $current=Invoke-RestMethod 'http://127.0.0.1:43128/status' -TimeoutSec 2
      if($health.ok -and $current.PSObject.Properties.Name -contains 'collector'){ $ready=$true; break }
    }catch{}
    Start-Sleep -Seconds 1
  }
  if(-not $ready){ throw 'Updated CBS server did not become ready; inspect its task before retrying.' }
  if(-not $health.autoPush){ throw 'CBS server is responding but auto-push is OFF. No refresh triggered.' }
  Write-Host 'Running one authenticated refresh and publication check...'
  $refresh=Invoke-RestMethod 'http://127.0.0.1:43128/refresh-sync' -Method Post -TimeoutSec 210
  $current=Invoke-RestMethod 'http://127.0.0.1:43128/status' -TimeoutSec 10
  if(-not $refresh.ok -or $current.collector.outcome -ne 'succeeded'){ throw 'CBS refresh verification did not succeed.' }
  $snapshotCommit=(& git log -1 --format=%H -- data/live/cbs-pickem.json).Trim()
  if($LASTEXITCODE -ne 0){ throw 'Snapshot commit verification failed.' }
  & git fetch origin main --quiet
  if($LASTEXITCODE -ne 0){ throw 'Could not verify remote publication.' }
  & git merge-base --is-ancestor $snapshotCommit origin/main
  if($LASTEXITCODE -ne 0){ throw 'Snapshot commit is not confirmed on origin/main.' }
  & (Join-Path $Repo 'tools\enable-sfiq-auto-update.ps1')
  Write-Host 'CBS reliability installation verified.' -ForegroundColor Green
  [pscustomobject]@{ Collector=$current.collector.outcome; LastSuccess=$current.collector.lastSuccessAt; SnapshotCommit=$snapshotCommit; AutoPush=$health.autoPush; AutoUpdateTaskInstalled=[bool](Get-ScheduledTask -TaskName 'Sunday Funday IQ - Auto Update'); RebootBeforeSignIn='Not resolved' } | Format-List
}finally{ Pop-Location }
