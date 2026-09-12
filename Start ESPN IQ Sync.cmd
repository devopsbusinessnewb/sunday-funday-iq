@echo off
setlocal
cd /d "%~dp0"
echo Starting ESPN IQ automatic sync...
echo Keep this window open while using the ESPN Fantasy IQ Bridge.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\espn-bridge-server.ps1"
if errorlevel 1 (
  echo.
  echo ESPN IQ sync stopped with an error.
  pause
)
