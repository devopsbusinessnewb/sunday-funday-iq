function Get-CbsSetupFailureReport {
    param([string]$Phase, [string]$FailureText, $BridgeStatus, [int]$HttpStatus = 0)
    # Classify locally, returning fixed codes only. Never emit raw stderr/HTTP bodies.
    $text = $FailureText + ' ' + [string]$BridgeStatus.lastRefreshError
    $reason = 'UNCLASSIFIED'
    if ($text -match 'Push failed|git push|Authentication failed|could not read Username|terminal prompts disabled') { $reason = 'GITHUB_PUBLICATION' }
    elseif ($text -match 'login/session appears expired|Re-run with --login') { $reason = 'CBS_SESSION' }
    elseif ($text -match 'Set SFIQ_CBS_POOL_URL|SFIQ_CBS_POOL_URL is not configured') { $reason = 'CBS_CONFIGURATION' }
    elseif ($text -match 'Playwright is not installed|Executable doesn.t exist') { $reason = 'BROWSER_RUNTIME' }
    elseif ($text -match 'Timeout|timed out') { $reason = 'TIMEOUT' }
    elseif ($text -match 'CBS receiver rejected capture|sanitized payload could not be loaded') { $reason = 'CAPTURE_OR_SANITIZATION' }
    $allowedPhases = @('FenceTasks','StopServer','RegisterTasks','StartServer','CheckHealth','CollectAndPublish','ConfirmSnapshot','EnableSchedules')
    if ($Phase -notin $allowedPhases) { $Phase = 'Unknown' }
    $outcome = [string]$BridgeStatus.collector.outcome
    if ($outcome -notin @('running','succeeded','failed')) { $outcome = 'unknown' }
    $errorType = [string]$BridgeStatus.collector.errorType
    if ($errorType -notmatch '^[A-Za-z][A-Za-z0-9]{0,63}$') { $errorType = 'unknown' }
    [pscustomobject]@{
        Phase = $Phase; ReasonCode = $reason; HttpStatus = $HttpStatus
        CollectorOutcome = $outcome; CollectorErrorType = $errorType
    }
}
