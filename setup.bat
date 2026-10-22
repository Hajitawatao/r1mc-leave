@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title R1MC Leave System - Setup

echo ==========================================================
echo   R1MC Leave Enrollment and Approval Module - Setup
echo ==========================================================
echo.
echo Before you continue:
echo   - Node.js 20 LTS (or newer) is installed
echo   - MySQL is running (for XAMPP: start MySQL in the XAMPP Control Panel)
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 20 LTS from https://nodejs.org then run setup.bat again.
  pause
  exit /b 1
)
for /f "tokens=1 delims=v." %%v in ('node -v') do set "NODEMAJOR=%%v"
if %NODEMAJOR% LSS 18 (
  echo Node.js 18 or newer is required. You have:
  node -v
  pause
  exit /b 1
)

echo [1/3] Database connection settings
node server\scripts\setup-env.js
if errorlevel 1 goto fail

echo.
echo [2/3] Installing server packages (needs internet the first time)
call npm --prefix server install --omit=dev --no-audit --no-fund
if errorlevel 1 goto fail

echo.
echo [3/3] Creating the database and tables
node server\scripts\migrate.js
if errorlevel 1 goto fail

echo.
echo ==========================================================
echo   Setup complete.
echo   1. Run start.bat to start the system.
echo   2. Open http://localhost:8080 and log in as "admin".
echo      The admin password is shown above. Change it at first login.
echo   3. Optional: run install-autostart.bat as Administrator so
echo      the system starts with Windows and the firewall allows
echo      other computers on the LAN to connect.
echo ==========================================================
pause
exit /b 0

:fail
echo.
echo Setup did not finish. Read the message above.
echo Most common cause: MySQL is not running, or the MySQL password in server\.env is wrong.
echo To re-enter the database settings, delete server\.env and run setup.bat again.
pause
exit /b 1
