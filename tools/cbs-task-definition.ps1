function ConvertTo-CbsUnattendedDefinition {
    param([Parameter(Mandatory)][string]$Xml, [switch]$Server)
    $scheduler = New-Object -ComObject 'Schedule.Service'
    $scheduler.Connect()
    $definition = $scheduler.NewTask(0)
    $definition.XmlText = $Xml
    # Use the native serializer: preserve actions, identities and existing schedules.
    $definition.Principal.LogonType = 1 # TASK_LOGON_PASSWORD
    $definition.Principal.RunLevel = 0 # Least privilege
    $definition.Settings.Enabled = $false # Stage without launching missed jobs.
    $definition.Settings.StartWhenAvailable = $true
    $definition.Settings.MultipleInstances = 2 # IgnoreNew
    if ($Server) {
        $definition.Settings.ExecutionTimeLimit = 'PT0S'
        $definition.Settings.RestartInterval = 'PT1M'
        $definition.Settings.RestartCount = 5
        $boot = $null
        foreach ($trigger in $definition.Triggers) {
            if ($trigger.Type -eq 8) { $boot = $trigger; break }
        }
        if ($null -eq $boot) { $boot = $definition.Triggers.Create(8) }
        $boot.Enabled = $true
        $boot.Delay = 'PT1M'
    }
    return $definition.XmlText
}

function Get-CbsIdentitySid([string]$Identity) {
    if ($Identity -match '^S-1-') { return $Identity }
    return ([System.Security.Principal.NTAccount]::new($Identity)).Translate(
        [System.Security.Principal.SecurityIdentifier]).Value
}
