function Invoke-CbsRefreshVerification {
    param([int]$TimeoutSeconds = 210, [System.Collections.IDictionary]$Evidence = @{})
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    function Get-CbsSafeRunId($Value) {
        if ([string]$Value -match '^[0-9a-f]{32}$') { return [string]$Value }
        return 'unknown'
    }
    function Get-CbsUtc($Value) {
        if (-not $Value) { return $null }
        try { return [DateTimeOffset]::Parse([string]$Value).UtcDateTime } catch { return $null }
    }

    $requestedAt = [DateTime]::UtcNow
    $start = Invoke-RestMethod 'http://127.0.0.1:43128/refresh' -Method Post -TimeoutSec 10
    if (-not $start.ok -or -not $start.started -or -not $start.runId) {
        throw 'CBS refresh could not be started exclusively; setup deferred.'
    }
    $Evidence['RequestedRunId'] = Get-CbsSafeRunId $start.runId
    $Evidence['StatusPollCount'] = 0
    $Evidence['VerificationElapsedSeconds'] = 0
    $Evidence['CorrelationMode'] = 'awaiting'
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
            $Evidence['CorrelationMode'] = 'exact-run-id'
            if (-not $status.lastRefreshOk -or $status.collector.outcome -ne 'succeeded') {
                throw 'CBS refresh completed unsuccessfully; inspect sanitized setup diagnostics.'
            }
            return $status
        }

        # The bridge run ID is in-memory while collector evidence is durable. Accept
        # a mismatched ID only when both layers prove a new, completed successful run.
        $collectorStarted = Get-CbsUtc $status.collector.startedAt
        $collectorFinished = Get-CbsUtc $status.collector.finishedAt
        $bridgeFinished = Get-CbsUtc $status.lastRefreshFinished
        $requestFloor = $requestedAt.AddSeconds(-2)
        $durableProof = (
            -not $status.refreshing -and
            $status.lastRefreshOk -eq $true -and
            $status.collector.outcome -eq 'succeeded' -and
            $collectorStarted -and $collectorStarted -ge $requestFloor -and
            $collectorFinished -and $collectorFinished -ge $collectorStarted -and
            $bridgeFinished -and $bridgeFinished -ge $requestFloor
        )
        if ($durableProof) {
            $Evidence['CorrelationMode'] = 'durable-success-proof'
            return $status
        }
        Start-Sleep -Seconds 1
    }
    throw 'CBS refresh verification timed out before this job completed.'
}
