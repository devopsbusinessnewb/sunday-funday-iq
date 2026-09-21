@echo off
setlocal
cd /d "%~dp0"
echo Sunday Funday IQ - Reset Yahoo Authorization
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\yahoo-sync.ps1" -ResetAuth
echo.
pause
