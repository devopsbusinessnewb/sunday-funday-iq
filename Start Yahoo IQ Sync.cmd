@echo off
setlocal
cd /d "%~dp0"
echo Sunday Funday IQ - Yahoo Sync
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\yahoo-sync.ps1" -Publish
echo.
pause
