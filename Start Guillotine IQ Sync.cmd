@echo off
setlocal
cd /d "%~dp0"
python workers\guillotine\collector.py --publish
if errorlevel 1 (
  echo.
  echo Guillotine IQ sync failed.
  pause
  exit /b 1
)
echo.
echo Guillotine IQ sync complete.
pause
