@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title R1MC Leave System

if not exist "server\.env" (
  echo server\.env not found. Run setup.bat first.
  pause
  exit /b 1
)
if not exist "server\node_modules" (
  echo Server packages are not installed. Run setup.bat first.
  pause
  exit /b 1
)

set "PORT=8080"
for /f "usebackq eol=# tokens=1,* delims==" %%a in ("server\.env") do (
  if /i "%%a"=="PORT" set "PORT=%%b"
)

echo ==========================================================
echo   R1MC Leave System
echo   Keep this window open. Closing it stops the system.
echo.
echo   On this computer:   http://localhost:%PORT%
echo   From other PCs on the network:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=*" %%b in ("%%a") do echo                       http://%%b:%PORT%
)
echo ==========================================================
echo.

:run
node server\src\index.js
echo.
echo The server stopped. Restarting in 5 seconds... (close this window to stop)
timeout /t 5 /nobreak >nul
goto run
