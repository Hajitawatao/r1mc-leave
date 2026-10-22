@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title R1MC Leave System - Rebuild frontend
echo Rebuilds the Vue frontend into server\public. Only needed after changing files in client\.
call npm --prefix client install --no-audit --no-fund
if errorlevel 1 goto fail
call npm --prefix client run build
if errorlevel 1 goto fail
echo Frontend rebuilt. Restart start.bat to serve the new version.
pause
exit /b 0
:fail
echo Build failed. Read the message above.
pause
exit /b 1
