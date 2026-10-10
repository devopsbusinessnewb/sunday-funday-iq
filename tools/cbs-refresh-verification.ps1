function Invoke-CbsRefreshVerification {
    param([int]$TimeoutSeconds = 210)
    $start = Invoke-RestMethod 'http://127.0.0.1:43128/refresh' -Method Post -TimeoutSec 10
    if (-not $start.ok -or -not $start.started -or -not $start.runId) {
        throw 'CBS refresh could not be started exclusively; setup deferred.'
    }
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $status = Invoke-RestMethod 'http://127.0.0.1:43128/status' -TimeoutSec 5
        if ($status.lastCompletedRunId -eq $start.runId) {
            if (-not $status.lastRefreshOk -or $status.collector.outcome -ne 'succeeded') {
                throw 'CBS refresh completed unsuccessfully; inspect sanitized setup diagnostics.'
            }
            return $status
        }
        Start-Sleep -Seconds 1
    }
    throw 'CBS refresh verification timed out before this job completed.'
}
