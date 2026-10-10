param([Parameter(Mandatory)][string]$BackupDirectory)
$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath (Join-Path $BackupDirectory 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.SchemaVersion -ne 1 -or @($manifest.Tasks).Count -ne 11) {
    throw 'Unexpected CBS backup manifest; no tasks changed.'
}
$scheduler = New-Object -ComObject 'Schedule.Service'
$scheduler.Connect()
$folder = $scheduler.GetFolder('\')
$definitions = @($manifest.Tasks | ForEach-Object {
    if ($_.Name -notmatch '^Sunday Funday IQ - (CBS Automation Server|CBS Refresh 0[1-9]|Auto Update)$' -or
        $_.File -notmatch '^task-[0-9]{2}\.xml$') { throw 'Unexpected backup entry; no tasks changed.' }
    $definition = $scheduler.NewTask(0)
    $definition.XmlText = Get-Content -LiteralPath (Join-Path $BackupDirectory $_.File) -Raw
    if ($definition.Principal.LogonType -ne 3) { throw 'Backup is not an interactive task; no tasks changed.' }
    [pscustomobject]@{ Name = $_.Name; Definition = $definition }
})
if (@($definitions.Name | Select-Object -Unique).Count -ne 11) { throw 'Duplicate backup tasks; no tasks changed.' }
foreach ($item in $definitions) {
    try { $folder.GetTask($item.Name).Stop(0) } catch { }
    $folder.RegisterTaskDefinition($item.Name, $item.Definition, 6,
        $item.Definition.Principal.UserId, $null, 3, $null) | Out-Null
}
$folder.GetTask('Sunday Funday IQ - CBS Automation Server').Run($null) | Out-Null
Write-Host 'Original interactive CBS task definitions restored. Reboot recovery is not enabled.'
