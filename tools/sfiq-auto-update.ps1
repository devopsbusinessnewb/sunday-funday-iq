$ErrorActionPreference='Stop'
$Repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$LogDir=[Environment]::GetEnvironmentVariable('SFIQ_LOG_DIR','User')
if([string]::IsNullOrWhiteSpace($LogDir)){ $LogDir='C:\Server\Logs' }
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log=Join-Path $LogDir 'sfiq-auto-update.log'
function Write-Log([string]$Message){
  Add-Content -Path $Log -Value ((Get-Date).ToString('s')+' '+$Message)
}

try{
  Set-Location $Repo
  $dirty=(& git status --porcelain 2>$null)
  if($LASTEXITCODE -ne 0){ throw 'git status failed' }
  if($dirty){ Write-Log 'Skipped update because the repository has local changes.'; exit 0 }

  & git fetch origin main --quiet
  if($LASTEXITCODE -ne 0){ throw 'git fetch origin main failed' }
  $local=(& git rev-parse HEAD).Trim()
  $remote=(& git rev-parse origin/main).Trim()
  if($local -eq $remote){ exit 0 }

  & git merge-base --is-ancestor $local $remote 2>$null
  if($LASTEXITCODE -ne 0){
    Write-Log ("Skipped non-fast-forward update. local=$local remote=$remote")
    exit 0
  }

  $changed=@(& git diff --name-only $local $remote)
  & git merge --ff-only origin/main --quiet
  if($LASTEXITCODE -ne 0){ throw 'git fast-forward merge failed' }

  $restart=$changed | Where-Object { $_ -in @('tools/cbs-bridge-server.py','tools/cbs-collector.py','tools/enable-cbs-production.ps1') }
  if($restart){
    $task='Sunday Funday IQ - CBS Automation Server'
    if(Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue){
      Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 1
      Start-ScheduledTask -TaskName $task
      Start-Sleep -Seconds 3
      try{
        $health=Invoke-RestMethod 'http://127.0.0.1:43128/health' -TimeoutSec 10
        if(-not $health.ok){ throw 'health returned not-ok' }
        Write-Log ("Fast-forwarded to $remote and restarted CBS automation server successfully.")
      }catch{
        Write-Log ("Fast-forwarded to $remote but CBS server health check failed: "+$_.Exception.Message)
      }
    }else{
      Write-Log ("Fast-forwarded to $remote; CBS server task was not installed, so no restart was attempted.")
    }
  }else{
    Write-Log ("Fast-forwarded to $remote; no CBS service restart required.")
  }
}catch{
  Write-Log ('Update error: '+$_.Exception.Message)
  exit 1
}
