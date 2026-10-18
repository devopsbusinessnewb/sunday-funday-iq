param(
    [string]$RepoPath = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

try {
    Write-Host ''
    Write-Host 'Sunday Funday IQ Updater' -ForegroundColor Cyan
    Write-Host '------------------------'

    if (-not (Test-Path (Join-Path $RepoPath '.git'))) {
        throw "Sunday Funday IQ repo not found: $RepoPath"
    }

    Set-Location $RepoPath
    $dirty = @(& git status --porcelain)
    if ($LASTEXITCODE -ne 0) { throw 'Could not read Git status.' }
    if ($dirty.Count -gt 0) {
        throw 'Update stopped safely because this repo has local changes. Nothing was overwritten.'
    }

    Write-Host 'Checking GitHub...' -ForegroundColor Yellow
    & git fetch origin main --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Could not reach GitHub.' }

    $local = (& git rev-parse HEAD).Trim()
    $remote = (& git rev-parse origin/main).Trim()
    if ($local -eq $remote) {
        Write-Host 'Already up to date.' -ForegroundColor Green
    } else {
        & git merge-base --is-ancestor $local $remote 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'Local and GitHub history differ. Automatic update stopped safely.' }
        & git merge --ff-only origin/main --quiet
        if ($LASTEXITCODE -ne 0) { throw 'Fast-forward update failed.' }
        Write-Host 'Updated to the latest GitHub version.' -ForegroundColor Green
    }

    $serverTask = 'Sunday Funday IQ - CBS Automation Server'
    if (Get-ScheduledTask -TaskName $serverTask -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $serverTask -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Start-ScheduledTask -TaskName $serverTask
        Write-Host 'CBS service restarted with the latest code.' -ForegroundColor Green
    }

    Write-Host ''
    Write-Host 'Sunday Funday IQ is current.' -ForegroundColor Green
}
catch {
    Write-Host ''
    Write-Host 'UPDATE FAILED' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ''
Read-Host 'Press Enter to close'
