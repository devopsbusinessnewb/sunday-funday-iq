function Invoke-CbsRefreshVerification {
    param([int]$TimeoutSeconds = 210, [System.Collections.IDictionary]$Evidence = @{})
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    function Get-CbsSafeRunId($Value) {
        if ([string]$Value -match '^[0-9a-f]{32}$') { return [string]$Value }
        return 'unknown'
    }
    $start = Invoke-RestMethod 'http://127.0.0.1:43128/refresh' -Method Post -TimeoutSec 10
    if (-not $start.ok -or -not $start.started -or -not $start.runId) {
        throw 'CBS refresh could not be started exclusively; setup deferred.'
    }
    $Evidence['RequestedRunId'] = Get-CbsSafeRunId $start.runId
    $Evidence['StatusPollCount'] = 0
    $Evidence['VerificationElapsedSeconds'] = 0
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $status = Invoke-RestMethod 'http://127.0.0.1:43128/status' -TimeoutSec 5
        $Evidence['StatusPollCount']++
        $Evidence['VerificationElapsedSeconds'] = [int]$watch.Elapsed.TotalSeconds
        $Evidence['CurrentRunId'] = Get-CbsSafeRunId $status.currentRunId
        $Evidence['CompletedRunId'] = Get-CbsSafeRunId $status.lastCompletedRunId
        $Evidence['RunIdsMatch'] = [bool]($status.lastCompletedRunId -eq $start.runId)
        $Evidence['BridgeRefreshing'] = [bool]$status.refreshing
        $Evidence['BridgeRefreshSucceeded'] = ($status.lastRefreshOk -eq $true)
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
