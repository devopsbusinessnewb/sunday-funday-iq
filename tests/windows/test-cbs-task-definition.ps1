$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\..\tools\cbs-task-definition.ps1')
function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}
$scheduler = New-Object -ComObject 'Schedule.Service'
$scheduler.Connect()
$source = $scheduler.NewTask(0)
$source.Principal.UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$source.Principal.LogonType = 3
$source.Settings.Enabled = $true
$source.Settings.ExecutionTimeLimit = 'PT1H'
$action = $source.Actions.Create(0)
$action.Path = 'C:\Windows\System32\cmd.exe'
$action.Arguments = '/c exit 0'
$action.WorkingDirectory = 'C:\Windows'
$weekly = $source.Triggers.Create(3)
$weekly.StartBoundary = '2099-01-01T06:00:00'
$weekly.DaysOfWeek = 1
$weekly.WeeksInterval = 1
$weekly.Enabled = $true
$originalXml = $source.XmlText
$serverXml = ConvertTo-CbsUnattendedDefinition -Xml $originalXml -Server
$converted = $scheduler.NewTask(0)
$converted.XmlText = $serverXml
Assert-True ($converted.Principal.UserId -eq $source.Principal.UserId) 'Identity was changed.'
Assert-True ($converted.Principal.LogonType -eq 1) 'Password logon missing.'
Assert-True (-not $converted.Settings.Enabled) 'Staged task can launch prematurely.'
Assert-True ($converted.Settings.ExecutionTimeLimit -eq 'PT0S') 'Server has execution limit.'
Assert-True ($converted.Settings.MultipleInstances -eq 2) 'Server overlap policy missing.'
Assert-True ($converted.Settings.RestartCount -eq 5) 'Bounded server restarts missing.'
Assert-True ($converted.Actions.Item(1).Path -eq $action.Path) 'Action path changed.'
Assert-True ($converted.Actions.Item(1).Arguments -eq $action.Arguments) 'Action arguments changed.'
Assert-True ($converted.Actions.Item(1).WorkingDirectory -eq $action.WorkingDirectory) 'Working directory changed.'
Assert-True ($converted.Triggers.Item(1).StartBoundary -eq $weekly.StartBoundary) 'Scheduled time changed.'
Assert-True ($converted.Triggers.Item(1).DaysOfWeek -eq $weekly.DaysOfWeek) 'Scheduled day changed.'
Assert-True ($converted.Triggers.Count -eq 2) 'Boot trigger missing.'
Assert-True ($converted.Triggers.Item(2).Type -eq 8 -and $converted.Triggers.Item(2).Delay -eq 'PT1M') 'Boot delay missing.'
Write-Host 'PASS: server conversion preserves identity, actions and schedule; adds staged boot lifecycle.'
$converted.XmlText = ConvertTo-CbsUnattendedDefinition -Xml $serverXml -Server
Assert-True ($converted.Triggers.Count -eq 2) 'Repeated conversion duplicated boot trigger.'
Write-Host 'PASS: repeated conversion does not duplicate boot triggers.'
$converted.XmlText = ConvertTo-CbsUnattendedDefinition -Xml $originalXml
Assert-True ($converted.Triggers.Count -eq 1) 'Refresh conversion changed trigger count.'
Assert-True ($converted.Settings.ExecutionTimeLimit -eq 'PT1H') 'Refresh execution limit changed.'
Assert-True ($converted.Principal.LogonType -eq 1) 'Refresh remains interactive.'
Write-Host 'PASS: refresh conversion preserves schedule and execution limit.'
