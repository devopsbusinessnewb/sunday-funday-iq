$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\..\tools\cbs-refresh-verification.ps1')
$global:cbsVerifyCalls = 0
$global:cbsVerifyFailure = $false
$global:cbsVerifyBusy = $false
function Start-Sleep { param($Seconds) }
function Invoke-RestMethod {
    param($Uri, $Method, $TimeoutSec)
    if ($Uri -match '/refresh$') {
        return [pscustomobject]@{ ok=$true; started=(-not $global:cbsVerifyBusy); runId='expected-run' }
    }
    if ($Uri -notmatch '/status$') { throw 'Unexpected endpoint; verification must not fetch the large capture payload.' }
    $global:cbsVerifyCalls++
    if ($global:cbsVerifyCalls -eq 1) {
        # An earlier completed run must not satisfy verification of the new run.
        return [pscustomobject]@{ lastCompletedRunId='older-run'; lastRefreshOk=$true; collector=[pscustomobject]@{ outcome='succeeded' } }
    }
    if ($global:cbsVerifyCalls -eq 2) {
        return [pscustomobject]@{ lastCompletedRunId='older-run'; refreshing=$true; collector=[pscustomobject]@{ outcome='running' } }
    }
    return [pscustomobject]@{ lastCompletedRunId='expected-run'; lastRefreshOk=(-not $global:cbsVerifyFailure); collector=[pscustomobject]@{ outcome=$(if ($global:cbsVerifyFailure) { 'failed' } else { 'succeeded' }) } }
}
$result = Invoke-CbsRefreshVerification
if ($global:cbsVerifyCalls -ne 3 -or $result.lastCompletedRunId -ne 'expected-run') { throw 'Verification did not wait for its own completed run.' }
Write-Host 'PASS: waits through running state and ignores success from an earlier run.'
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
