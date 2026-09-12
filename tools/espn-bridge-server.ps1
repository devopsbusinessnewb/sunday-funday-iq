$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Output = Join-Path $Root 'data\live\espn.json'
$Port = 43127
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Invoke-Git([string[]]$GitArgs) {
    $text = (& git @GitArgs 2>&1 | Out-String).Trim()
    [pscustomobject]@{ Code = $LASTEXITCODE; Text = $text }
}

function Write-Response($Stream, [int]$Status, [string]$Body) {
    $reason = if ($Status -eq 200) { 'OK' } elseif ($Status -eq 204) { 'No Content' } elseif ($Status -eq 404) { 'Not Found' } else { 'Bad Request' }
    $bodyBytes = $Utf8.GetBytes($Body)
    $headers = "HTTP/1.1 $Status $reason`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Methods: POST, OPTIONS`r`nContent-Type: application/json`r`nContent-Length: $($bodyBytes.Length)`r`nConnection: close`r`n`r`n"
    $headerBytes = $Utf8.GetBytes($headers)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($bodyBytes.Length) { $Stream.Write($bodyBytes, 0, $bodyBytes.Length) }
    $Stream.Flush()
}

function Read-Request($Stream) {
    $bytes = New-Object System.Collections.Generic.List[byte]
    $marker = [byte[]](13,10,13,10)
    while ($true) {
        $b = $Stream.ReadByte()
        if ($b -lt 0) { throw 'Connection closed before request headers were complete.' }
        $bytes.Add([byte]$b)
        $n = $bytes.Count
        if ($n -ge 4 -and $bytes[$n-4] -eq $marker[0] -and $bytes[$n-3] -eq $marker[1] -and $bytes[$n-2] -eq $marker[2] -and $bytes[$n-1] -eq $marker[3]) { break }
        if ($n -gt 65536) { throw 'Request headers are too large.' }
    }
    $headerText = $Utf8.GetString($bytes.ToArray())
    $lines = $headerText -split "`r`n"
    $requestLine = $lines[0] -split ' '
    $headers = @{}
    foreach ($line in $lines[1..($lines.Length-1)]) {
        if ($line -match '^([^:]+):\s*(.*)$') { $headers[$matches[1].ToLowerInvariant()] = $matches[2] }
    }
    $length = if ($headers.ContainsKey('content-length')) { [int]$headers['content-length'] } else { 0 }
    if ($length -lt 0 -or $length -gt 2000000) { throw 'Invalid payload size.' }
    $body = New-Object byte[] $length
    $read = 0
    while ($read -lt $length) {
        $count = $Stream.Read($body, $read, $length - $read)
        if ($count -le 0) { throw 'Connection closed before request body was complete.' }
        $read += $count
    }
    [pscustomobject]@{ Method = $requestLine[0]; Path = $requestLine[1]; Body = $Utf8.GetString($body) }
}

function Push-Snapshot($Snapshot) {
    $relative = 'data/live/espn.json'
    $result = Invoke-Git @('add', $relative)
    if ($result.Code) { throw "Git add failed: $($result.Text)" }
    $result = Invoke-Git @('diff', '--cached', '--quiet')
    if ($result.Code -eq 0) { return @{ pushed = $false; reason = 'No ESPN data changes' } }
    if ($result.Code -ne 1) { throw "Git diff failed: $($result.Text)" }

    $week = if ($null -ne $Snapshot.meta.week) { [string]$Snapshot.meta.week } else { 'unknown' }
    $result = Invoke-Git @('commit', '-m', "data: refresh ESPN week $week")
    if ($result.Code) { throw "Git commit failed: $($result.Text)" }

    $result = Invoke-Git @('push', 'origin', 'main')
    if ($result.Code) {
        $result = Invoke-Git @('pull', '--rebase', '--autostash', 'origin', 'main')
        if ($result.Code) { throw "ESPN snapshot committed locally, but GitHub sync needs attention: $($result.Text)" }
        $result = Invoke-Git @('push', 'origin', 'main')
        if ($result.Code) { throw "ESPN snapshot committed locally, but push failed: $($result.Text)" }
    }
    $commit = Invoke-Git @('rev-parse', '--short', 'HEAD')
    @{ pushed = $true; commit = $commit.Text }
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "ESPN IQ sync listening on http://127.0.0.1:$Port -> $Output"
Write-Host 'Automatic GitHub push: ON'
Write-Host 'Leave this window open while using the ESPN IQ Bridge.'

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        $stream = $null
        try {
            $stream = $client.GetStream()
            $request = Read-Request $stream
            if ($request.Method -eq 'OPTIONS') { Write-Response $stream 204 ''; continue }
            if ($request.Method -ne 'POST' -or $request.Path -ne '/espn-sync') { Write-Response $stream 404 '{"ok":false,"error":"Not found"}'; continue }
            if (-not $request.Body) { throw 'Invalid payload size.' }
            $lower = $request.Body.ToLowerInvariant()
            foreach ($key in @('espn_s2','swid','cookie','authorization')) {
                if ($lower.Contains($key)) { throw 'Credential-like data detected; refusing snapshot.' }
            }
            $snapshot = $request.Body | ConvertFrom-Json
            if ($snapshot.meta.status -ne 'connected') { throw 'Snapshot status must be connected.' }
            if ($null -eq $snapshot.lineup -or $null -eq $snapshot.bench) { throw 'Missing lineup or bench array.' }
            if (-not $snapshot.team.name) { throw 'Missing team name.' }
            $folder = Split-Path -Parent $Output
            [System.IO.Directory]::CreateDirectory($folder) | Out-Null
            [System.IO.File]::WriteAllText($Output, (($snapshot | ConvertTo-Json -Depth 100) + "`n"), $Utf8)
            $push = Push-Snapshot $snapshot
            $response = @{ ok = $true; path = 'data/live/espn.json' }
            foreach ($key in $push.Keys) { $response[$key] = $push[$key] }
            Write-Response $stream 200 ($response | ConvertTo-Json -Compress)
            Write-Host "[ESPN IQ] Synced $($snapshot.team.name)."
        } catch {
            if ($stream) { Write-Response $stream 400 (@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress) }
            Write-Host "[ESPN IQ] ERROR: $($_.Exception.Message)" -ForegroundColor Red
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
