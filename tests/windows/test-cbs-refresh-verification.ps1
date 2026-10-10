$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\..\tools\cbs-refresh-verification.ps1')
$global:cbsVerifyCalls = 0
$global:cbsVerifyFailure = $false
$global:cbsVerifyBusy = $false
function Start-Sleep { param($Seconds) }
function Invoke-RestMethod {
    param($Uri, $Method, $TimeoutSec)
    if ($Uri -match '/refresh$') {
        return [pscustomobject]@{ ok=$true; started=(-not $global:cbsVerifyBusy); runId='11111111111111111111111111111111' }
    }
    if ($Uri -notmatch '/status$') { throw 'Unexpected endpoint; verification must not fetch the large capture payload.' }
    $global:cbsVerifyCalls++
    if ($global:cbsVerifyCalls -eq 1) {
        # An earlier completed run must not satisfy verification of the new run.
        return [pscustomobject]@{ lastCompletedRunId='22222222222222222222222222222222'; lastRefreshOk=$true; collector=[pscustomobject]@{ outcome='succeeded' } }
    }
    if ($global:cbsVerifyCalls -eq 2) {
        return [pscustomobject]@{ lastCompletedRunId='22222222222222222222222222222222'; refreshing=$true; collector=[pscustomobject]@{ outcome='running' } }
    }
    return [pscustomobject]@{ lastCompletedRunId='11111111111111111111111111111111'; lastRefreshOk=(-not $global:cbsVerifyFailure); collector=[pscustomobject]@{ outcome=$(if ($global:cbsVerifyFailure) { 'failed' } else { 'succeeded' }) } }
}
$evidence = @{}
$result = Invoke-CbsRefreshVerification -Evidence $evidence
if ($global:cbsVerifyCalls -ne 3 -or $result.lastCompletedRunId -ne '11111111111111111111111111111111') { throw 'Verification did not wait for its own completed run.' }
if (-not $evidence.RunIdsMatch -or $evidence.StatusPollCount -ne 3 -or $evidence.CorrelationMode -ne 'exact-run-id') { throw 'Exact-run diagnostics are incorrect.' }
Write-Host 'PASS: waits through running state and requires its own successful run.'

$global:cbsVerifyCalls = 0
$global:cbsVerifyFailure = $true
$rejected = $false
try { Invoke-CbsRefreshVerification | Out-Null } catch { $rejected = $true }
if (-not $rejected -or $global:cbsVerifyCalls -ne 3) { throw 'Completed failure was not rejected.' }
Write-Host 'PASS: rejects a failed completed run.'

$global:cbsVerifyBusy = $true
$global:cbsVerifyCalls = 0
$rejected = $false
try { Invoke-CbsRefreshVerification | Out-Null } catch { $rejected = $true }
if (-not $rejected -or $global:cbsVerifyCalls -ne 0) { throw 'Busy refresh was not deferred.' }
Write-Host 'PASS: defers when another refresh owns the job.'

$global:cbsVerifyBusy = $false
$rejected = $false
try { Invoke-CbsRefreshVerification -TimeoutSeconds 0 | Out-Null } catch { $rejected = $true }
if (-not $rejected -or $global:cbsVerifyCalls -ne 0) { throw 'Verification timeout was not bounded.' }
Write-Host 'PASS: bounds the wait when the run does not complete.'

function Invoke-RestMethod {
    param($Uri, $Method, $TimeoutSec)
    if ($Uri -match '/refresh$') {
        return [pscustomobject]@{ ok=$true; started=$true; runId='33333333333333333333333333333333' }
    }
    return [pscustomobject]@{
        refreshing=$false
        currentRunId=$null
        lastCompletedRunId='44444444444444444444444444444444'
        lastRefreshOk=$true
        lastRefreshFinished='2099-01-01T00:01:01Z'
        collector=[pscustomobject]@{
            outcome='succeeded'
            startedAt='2099-01-01T00:00:00Z'
            finishedAt='2099-01-01T00:01:00Z'
        }
    }
}
$durableEvidence = @{}
$result = Invoke-CbsRefreshVerification -Evidence $durableEvidence
if ($durableEvidence.RunIdsMatch -or $durableEvidence.CorrelationMode -ne 'durable-success-proof') { throw 'Durable proof did not safely resolve the run-ID mismatch.' }
if ($result.collector.outcome -ne 'succeeded') { throw 'Durable proof did not return the successful status.' }
Write-Host 'PASS: accepts mismatched bridge ID only with new durable collector and bridge success proof.'

function Invoke-RestMethod {
    param($Uri, $Method, $TimeoutSec)
    if ($Uri -match '/refresh$') {
        return [pscustomobject]@{ ok=$true; started=$true; runId='55555555555555555555555555555555' }
    }
    return [pscustomobject]@{
        refreshing=$false
        currentRunId='credential-like-value-must-never-be-reported'
        lastCompletedRunId='66666666666666666666666666666666'
        lastRefreshOk=$true
        collector=[pscustomobject]@{ outcome='succeeded' }
    }
}
$timeoutEvidence = @{}
$rejected = $false
try { Invoke-CbsRefreshVerification -TimeoutSeconds 1 -Evidence $timeoutEvidence | Out-Null } catch { $rejected = $true }
if (-not $rejected -or $timeoutEvidence.RunIdsMatch -or $timeoutEvidence.BridgeRefreshing) { throw 'Mismatch timeout evidence is incorrect.' }
if ($timeoutEvidence.RequestedRunId -ne '55555555555555555555555555555555' -or $timeoutEvidence.CompletedRunId -ne '66666666666666666666666666666666') { throw 'Mismatch run IDs were lost.' }
if ($timeoutEvidence.CurrentRunId -ne 'unknown' -or ($timeoutEvidence | ConvertTo-Json) -match 'credential-like') { throw 'Non-ID text leaked into diagnostics.' }
Write-Host 'PASS: rejects weak mismatch evidence and retains sanitized diagnostics.'
