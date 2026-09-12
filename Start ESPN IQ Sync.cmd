@echo off
setlocal
cd /d "%~dp0"
set SFIQ_AUTO_PUSH=1
where python >nul 2>&1
if errorlevel 1 (
  echo Python was not found on this PC.
  echo Install Python or add it to PATH, then run this file again.
  pause
  exit /b 1
)
echo Starting ESPN IQ automatic sync...
echo Keep this window open while using the ESPN Fantasy IQ Bridge.
echo.
python tools\espn-bridge-server.py
if errorlevel 1 (
  echo.
  echo ESPN IQ sync stopped with an error.
  pause
)
