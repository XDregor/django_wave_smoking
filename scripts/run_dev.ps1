param(
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$managePy = Join-Path $projectRoot "manage.py"
$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $managePy)) {
    throw "manage.py not found in $projectRoot"
}

function Get-ProjectRunserverProcesses {
    try {
        $rootNeedle = $projectRoot.ToLowerInvariant()
        return @(
            Get-CimInstance Win32_Process |
                Where-Object {
                    $_.Name -in @("python.exe", "pythonw.exe") -and
                    $_.CommandLine -and
                    $_.CommandLine.ToLowerInvariant().Contains($rootNeedle) -and
                    $_.CommandLine -match "manage\.py\s+runserver" -and
                    $_.CommandLine -match "(?:127\.0\.0\.1:)?$Port(?:\s|$)"
                }
        )
    } catch {
        Write-Warning "Could not inspect complete process tree. Falling back to port detection."
        return @()
    }
}

$serverProcesses = Get-ProjectRunserverProcesses
if ($serverProcesses.Count -gt 0) {
    $serverIds = @($serverProcesses | ForEach-Object { [int]$_.ProcessId })
    $rootProcesses = @(
        $serverProcesses | Where-Object { [int]$_.ParentProcessId -notin $serverIds }
    )

    foreach ($serverProcess in $rootProcesses) {
        Write-Host "Stopping WAVE Django process tree PID $($serverProcess.ProcessId)..." -ForegroundColor Yellow
        taskkill /PID $serverProcess.ProcessId /T /F | Out-Null
    }

    Start-Sleep -Milliseconds 600
}

$listenerPattern = "^\s*TCP\s+127\.0\.0\.1:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$"
$listenerIds = @(
    netstat -ano -p tcp |
        Select-String -Pattern $listenerPattern |
        ForEach-Object {
            if ($_.Line -match $listenerPattern) {
                [int]$Matches[1]
            }
        } |
        Sort-Object -Unique
)

foreach ($processId in $listenerIds) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $process) {
        continue
    }
    if ($process.ProcessName -notin @("python", "pythonw")) {
        throw "Port $Port is occupied by $($process.ProcessName) (PID $processId). Stop it manually or use another port."
    }

    Write-Host "Stopping stale Django/Python process PID $processId on port $Port..." -ForegroundColor Yellow
    Stop-Process -Id $processId -Force
}

if ($listenerIds.Count -gt 0) {
    Start-Sleep -Milliseconds 500
}

Set-Location -LiteralPath $projectRoot
Write-Host "Starting WAVE Django server at http://127.0.0.1:$Port/" -ForegroundColor Green

if (Test-Path -LiteralPath $venvPython) {
    & $venvPython $managePy runserver "127.0.0.1:$Port"
} else {
    & poetry run python $managePy runserver "127.0.0.1:$Port"
}

exit $LASTEXITCODE
