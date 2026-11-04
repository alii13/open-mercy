@echo off
setlocal
cd /d "%~dp0"

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo [RUNE RIOT] Windows PowerShell was not found.
  echo Install or enable Windows PowerShell, then run this file again.
  if not defined RUNE_RIOT_NO_PAUSE pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-Rune-Riot.ps1" %*
if errorlevel 1 (
  echo.
  echo [RUNE RIOT] Startup failed. Read the message above for the exact fix.
  if not defined RUNE_RIOT_NO_PAUSE pause
  exit /b 1
)

endlocal
