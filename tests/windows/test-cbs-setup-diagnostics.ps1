$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\..\tools\cbs-setup-diagnostics.ps1')
$status = [pscustomobject]@{
    lastRefreshError = 'CBS login/session appears expired. Re-run with --login. password=PRIVATE_SENTINEL'
    collector = [pscustomobject]@{ outcome='failed'; errorType='RuntimeError' }
}
$report = Get-CbsSetupFailureReport -Phase 'CollectAndPublish' -FailureText 'private HTTP response PRIVATE_SENTINEL' -BridgeStatus $status -HttpStatus 400
if ($report.ReasonCode -ne 'CBS_SESSION' -or $report.Phase -ne 'CollectAndPublish') { throw 'Session failure not classified.' }
if (($report | ConvertTo-Json) -match 'PRIVATE_SENTINEL|login/session|password=') { throw 'Raw failure text leaked into report.' }
$status.lastRefreshError = 'CBS receiver rejected capture (400): Push failed: Authentication failed PRIVATE_SENTINEL'
$report = Get-CbsSetupFailureReport -Phase 'CollectAndPublish' -BridgeStatus $status
if ($report.ReasonCode -ne 'GITHUB_PUBLICATION') { throw 'Publication error misclassified as generic capture failure.' }
$status.collector.errorType = 'token=PRIVATE_SENTINEL'
$report = Get-CbsSetupFailureReport -Phase 'PRIVATE_SENTINEL' -BridgeStatus $status
if ($report.Phase -ne 'Unknown' -or $report.CollectorErrorType -ne 'unknown' -or ($report | ConvertTo-Json) -match 'PRIVATE_SENTINEL') { throw 'Unexpected fields not sanitized.' }
Write-Host 'PASS: failure phase and fixed reason codes retained without leaking raw response data.'
