@echo off
setlocal
cd /d "%~dp0"

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo [RUNE RIOT] Windows PowerShell was not found.
  if not defined RUNE_RIOT_NO_PAUSE pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Stop-Rune-Riot.ps1"
if errorlevel 1 (
  if not defined RUNE_RIOT_NO_PAUSE pause
  exit /b 1
)

endlocal
