[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [switch]$FrontendOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$frontendDir = Join-Path $repoRoot 'frontend'
$gameServerDir = Join-Path $repoRoot 'game-server'
$frontendEnv = Join-Path $frontendDir '.env.local'
$workerToml = Join-Path $gameServerDir 'wrangler.toml'
$runtimeDir = Join-Path $repoRoot '.local\runtime'
$logDir = Join-Path $runtimeDir 'logs'
$frontendUrl = 'http://127.0.0.1:5173/'
$workerHealthUrl = 'http://127.0.0.1:8787/health'

function Write-Step([string]$Message) {
    Write-Host "[RUNE RIOT] $Message" -ForegroundColor Cyan
}

function Test-Placeholder([string]$Value) {
    return $Value -match '(?i)your-project-ref|your-anon-key|your-publishable|replace-me|change-me'
}

function Test-PublicSupabaseConfig([string]$Url, [string]$Key) {
    if ([string]::IsNullOrWhiteSpace($Url) -or [string]::IsNullOrWhiteSpace($Key)) { return $false }
    if ((Test-Placeholder $Url) -or (Test-Placeholder $Key)) { return $false }
    $parsed = $null
    if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$parsed)) { return $false }
    if ($parsed.Scheme -notin @('http', 'https')) { return $false }
    return $Key.StartsWith('sb_publishable_') -or $Key.StartsWith('eyJ')
}

function Read-EnvFile([string]$Path) {
    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $values }
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^\s*([^#][^=]*)=(.*)$') {
            $values[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
    return $values
}

function Read-TomlString([string]$Path, [string]$Name) {
    $content = [IO.File]::ReadAllText($Path)
    $match = [regex]::Match($content, "(?m)^\s*$([regex]::Escape($Name))\s*=\s*`"([^`"]+)`"\s*$")
    if (-not $match.Success) { return '' }
    return $match.Groups[1].Value.Trim()
}

function Ensure-LocalConfig {
    $existing = Read-EnvFile $frontendEnv
    $url = if ($existing.ContainsKey('VITE_SUPABASE_URL')) { [string]$existing['VITE_SUPABASE_URL'] } else { '' }
    $key = if ($existing.ContainsKey('VITE_SUPABASE_ANON_KEY')) { [string]$existing['VITE_SUPABASE_ANON_KEY'] } else { '' }

    if (Test-PublicSupabaseConfig $url $key) {
        Write-Step 'Using the existing valid frontend/.env.local configuration.'
        return
    }

    if (-not (Test-Path -LiteralPath $workerToml)) {
        throw 'No valid frontend configuration exists and game-server/wrangler.toml is missing. Create frontend/.env.local with a real Supabase URL and publishable/anon key.'
    }

    $url = Read-TomlString $workerToml 'SUPABASE_URL'
    $key = Read-TomlString $workerToml 'SUPABASE_ANON_KEY'
    if (-not (Test-PublicSupabaseConfig $url $key)) {
        throw 'No valid public Supabase client values were found. Create frontend/.env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from a Supabase project with anonymous sign-ins enabled.'
    }

    $lines = @(
        '# Generated locally by Start-Rune-Riot.bat. This file is git-ignored.',
        "VITE_SUPABASE_URL=$url",
        "VITE_SUPABASE_ANON_KEY=$key",
        'VITE_GAME_SERVER_URL=http://127.0.0.1:8787'
    )
    [IO.File]::WriteAllLines($frontendEnv, $lines, [Text.UTF8Encoding]::new($false))
    Write-Step 'Created frontend/.env.local from the repository''s existing public client configuration.'
}

function Ensure-Dependencies([string]$Directory, [string]$Label) {
    if (Test-Path -LiteralPath (Join-Path $Directory 'node_modules')) { return }
    Write-Step "$Label dependencies are missing; running npm ci..."
    Push-Location $Directory
    try {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed for $Label." }
    } finally {
        Pop-Location
    }
}

function Test-TcpPort([int]$Port) {
    $client = [Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        if (-not $task.Wait(400)) { return $false }
        return $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Test-Http([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
    } catch {
        return $false
    }
}

function Wait-ForHttp([string]$Url, [Diagnostics.Process]$Process, [string]$Label, [string]$ErrorLog) {
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if (Test-Http $Url) { return }
        if ($Process.HasExited) {
            $tail = if (Test-Path -LiteralPath $ErrorLog) { (Get-Content -LiteralPath $ErrorLog -Tail 20) -join [Environment]::NewLine } else { 'No error log was written.' }
            throw "$Label stopped during startup.`n$tail"
        }
        Start-Sleep -Milliseconds 500
    }
    throw "$Label did not become ready at $Url. Check $ErrorLog"
}

function Start-HiddenNpmService(
    [string]$Directory,
    [string[]]$Arguments,
    [string]$Name,
    [string]$ReadyUrl,
    [int]$Port
) {
    if (Test-TcpPort $Port) {
        if (Test-Http $ReadyUrl) {
            Write-Step "$Name is already running at $ReadyUrl"
            return $null
        }
        throw "Port $Port is already occupied by another program. Close it or change that program's port before starting RUNE RIOT."
    }

    $stdout = Join-Path $logDir "$Name.out.log"
    $stderr = Join-Path $logDir "$Name.err.log"
    $npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
    $process = Start-Process -FilePath $npmPath `
        -ArgumentList $Arguments `
        -WorkingDirectory $Directory `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -PassThru

    Wait-ForHttp $ReadyUrl $process $Name $stderr
    Write-Step "$Name is ready at $ReadyUrl"
    return $process
}

try {
    Write-Host ''
    Write-Host 'RUNE RIOT - LOCAL LAUNCHER' -ForegroundColor Yellow
    Write-Host '--------------------------' -ForegroundColor DarkYellow

    if (-not (Test-Path -LiteralPath (Join-Path $frontendDir 'package.json'))) {
        throw "frontend/package.json was not found under $repoRoot"
    }

    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $nodeCommand -or -not $npmCommand) {
        throw 'Node.js and npm were not found. Install Node.js 22 LTS or newer, reopen the terminal, and run Start-Rune-Riot.bat again.'
    }

    $nodeVersion = (& node.exe -p "process.versions.node").Trim()
    $nodeMajor = [int]($nodeVersion.Split('.')[0])
    if ($nodeMajor -lt 22) {
        throw "Node.js $nodeVersion is installed, but RUNE RIOT requires Node.js 22 or newer."
    }
    Write-Step "Node.js $nodeVersion detected."

    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    Ensure-LocalConfig
    Ensure-Dependencies $frontendDir 'Frontend'
    if (-not $FrontendOnly) { Ensure-Dependencies $gameServerDir 'Game server' }

    $started = @()
    if (-not $FrontendOnly) {
        $worker = Start-HiddenNpmService `
            -Directory $gameServerDir `
            -Arguments @('run', 'dev', '--', '--ip', '127.0.0.1', '--port', '8787') `
            -Name 'game-server' `
            -ReadyUrl $workerHealthUrl `
            -Port 8787
        if ($worker) { $started += $worker }
    }

    $frontend = Start-HiddenNpmService `
        -Directory $frontendDir `
        -Arguments @('run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort') `
        -Name 'frontend' `
        -ReadyUrl $frontendUrl `
        -Port 5173
    if ($frontend) { $started += $frontend }

    if ($started.Count -gt 0) {
        $processState = $started | ForEach-Object {
            [ordered]@{ id = $_.Id; name = $_.ProcessName; startedAt = (Get-Date).ToString('o') }
        }
        [IO.File]::WriteAllText(
            (Join-Path $runtimeDir 'processes.json'),
            ($processState | ConvertTo-Json),
            [Text.UTF8Encoding]::new($false)
        )
    }

    if (-not $NoBrowser) {
        Write-Step 'Opening RUNE RIOT in the default browser...'
        Start-Process $frontendUrl
    }

    Write-Host ''
    Write-Host "RUNE RIOT is ready: $frontendUrl" -ForegroundColor Green
    if (-not $FrontendOnly) { Write-Host "Local multiplayer worker: $workerHealthUrl" -ForegroundColor Green }
    Write-Host "Logs: $logDir" -ForegroundColor DarkGray
    Write-Host 'Run Stop-Rune-Riot.bat to stop launcher-owned local services.' -ForegroundColor DarkGray
    Write-Host 'The existing Supabase development endpoint is still required for guest authentication.' -ForegroundColor DarkGray
    exit 0
} catch {
    Write-Host ''
    Write-Host "RUNE RIOT could not start: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Logs (when available): $logDir" -ForegroundColor DarkGray
    exit 1
}
