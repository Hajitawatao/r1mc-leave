@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title R1MC Leave System - Auto start and firewall

net session >nul 2>&1
if errorlevel 1 (
  echo This must be run as Administrator.
  echo Right-click install-autostart.bat and choose "Run as administrator".
  pause
  exit /b 1
)

set "PORT=8080"
for /f "usebackq eol=# tokens=1,* delims==" %%a in ("server\.env") do (
  if /i "%%a"=="PORT" set "PORT=%%b"
)

echo Allowing port %PORT% through Windows Firewall (LAN access)...
netsh advfirewall firewall delete rule name="R1MC Leave System" >nul 2>&1
netsh advfirewall firewall add rule name="R1MC Leave System" dir=in action=allow protocol=TCP localport=%PORT% profile=domain,private
if errorlevel 1 echo Could not add the firewall rule.

echo Registering the system to start when Windows starts...
schtasks /create /tn "R1MC Leave System" /tr "\"%~dp0start.bat\"" /sc onstart /ru SYSTEM /rl HIGHEST /f
if errorlevel 1 (
  echo Could not create the scheduled task.
  pause
  exit /b 1
)

echo.
echo Done. The leave system will start automatically after a restart.
echo IMPORTANT: MySQL must also start with Windows.
echo   XAMPP: open the XAMPP Control Panel as Administrator and tick the
echo   "Service" box beside MySQL.
echo To remove auto start later:  schtasks /delete /tn "R1MC Leave System" /f
pause
