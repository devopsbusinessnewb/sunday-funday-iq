param(
  [switch]$NoPublish,
  [int]$Season=2026,
  [int]$Week=0
)

$ErrorActionPreference='Stop'
$Repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Yahoo=Join-Path $Repo 'tools\yahoo-sync.ps1'
$ServerRoot='C:\Server'
$LogDir=Join-Path $ServerRoot 'Logs\SundayFundayIQ\Yahoo'
$LockPath=Join-Path $ServerRoot 'Temp\sfiq-yahoo-sync.lock'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $LockPath -Parent) | Out-Null

if(Test-Path $LockPath){
  try{
    $age=((Get-Date)-(Get-Item $LockPath).LastWriteTime).TotalMinutes
    if($age -lt 30){
      Add-Content -Path (Join-Path $LogDir 'yahoo-sync.log') -Value "$(Get-Date -Format o) SKIP existing lock age=$([math]::Round($age,1))m"
      exit 0
    }
  }catch{}
  Remove-Item $LockPath -Force -ErrorAction SilentlyContinue
}

Set-Content -Path $LockPath -Value $PID
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$runLog=Join-Path $LogDir ("yahoo-$stamp.log")
$summaryLog=Join-Path $LogDir 'yahoo-sync.log'

try{
  Add-Content -Path $summaryLog -Value "$(Get-Date -Format o) START publish=$(-not $NoPublish) season=$Season week=$Week"
  Push-Location $Repo
  try{
    $args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$Yahoo,'-Season',"$Season",'-Week',"$Week")
    if(-not $NoPublish){$args+='-Publish'}
    & powershell.exe @args *>&1 | Tee-Object -FilePath $runLog
    $code=$LASTEXITCODE
  } finally {
    Pop-Location
  }
  if($code -ne 0){throw "Yahoo sync exited with code $code"}
  Add-Content -Path $summaryLog -Value "$(Get-Date -Format o) SUCCESS"
  exit 0
}
catch{
  Add-Content -Path $summaryLog -Value "$(Get-Date -Format o) FAIL $($_.Exception.Message)"
  Add-Content -Path $runLog -Value "ERROR: $($_.Exception.Message)"
  exit 1
}
finally{
  Remove-Item $LockPath -Force -ErrorAction SilentlyContinue
}
