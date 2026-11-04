Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$statePath = Join-Path $repoRoot '.local\runtime\processes.json'

if (-not (Test-Path -LiteralPath $statePath)) {
    Write-Host '[RUNE RIOT] No launcher-owned processes are recorded.' -ForegroundColor Yellow
    exit 0
}

try {
    $entries = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $stopped = 0

    foreach ($entry in $entries) {
        $process = Get-Process -Id ([int]$entry.id) -ErrorAction SilentlyContinue
        if (-not $process) { continue }

        $recordedStart = [DateTimeOffset]::Parse([string]$entry.startedAt).LocalDateTime
        $ageDifference = [Math]::Abs(($process.StartTime - $recordedStart).TotalSeconds)
        if ($process.ProcessName -ne [string]$entry.name -or $ageDifference -gt 60) {
            Write-Host "[RUNE RIOT] Skipped PID $($entry.id): it no longer matches the recorded launcher process." -ForegroundColor Yellow
            continue
        }

        & taskkill.exe /PID ([string]$entry.id) /T /F 2>$null | Out-Null
        $stopped++
    }

    [IO.File]::Delete($statePath)
    Write-Host "[RUNE RIOT] Stopped $stopped launcher-owned process tree(s)." -ForegroundColor Green
    exit 0
} catch {
    Write-Host "[RUNE RIOT] Could not stop local services: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
