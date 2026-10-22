@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title R1MC Leave System - Backup

if not exist "server\.env" (
  echo server\.env not found. Run setup.bat first.
  pause
  exit /b 1
)
set "DB_HOST=127.0.0.1"
set "DB_PORT=3306"
set "DB_USER=root"
set "DB_PASSWORD="
set "DB_NAME=r1mc_leave"
for /f "usebackq eol=# tokens=1,* delims==" %%a in ("server\.env") do (
  if /i "%%a"=="DB_HOST" set "DB_HOST=%%b"
  if /i "%%a"=="DB_PORT" set "DB_PORT=%%b"
  if /i "%%a"=="DB_USER" set "DB_USER=%%b"
  if /i "%%a"=="DB_PASSWORD" set "DB_PASSWORD=%%b"
  if /i "%%a"=="DB_NAME" set "DB_NAME=%%b"
)

set "DUMP="
if exist "C:\xampp\mysql\bin\mysqldump.exe" set "DUMP=C:\xampp\mysql\bin\mysqldump.exe"
if not defined DUMP for /f "delims=" %%m in ('where mysqldump 2^>nul') do if not defined DUMP set "DUMP=%%m"
if not defined DUMP (
  echo mysqldump was not found. Install MySQL client tools or XAMPP.
  pause
  exit /b 1
)

for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd_HHmm'"`) do set "STAMP=%%d"
if not exist backups mkdir backups

echo Backing up database %DB_NAME% ...
if defined DB_PASSWORD (
  "%DUMP%" -h %DB_HOST% -P %DB_PORT% -u %DB_USER% --password=%DB_PASSWORD% --single-transaction --routines %DB_NAME% > "backups\%DB_NAME%_%STAMP%.sql"
) else (
  "%DUMP%" -h %DB_HOST% -P %DB_PORT% -u %DB_USER% --single-transaction --routines %DB_NAME% > "backups\%DB_NAME%_%STAMP%.sql"
)
if errorlevel 1 (
  echo Database backup failed.
  pause
  exit /b 1
)

echo Backing up uploaded documents ...
powershell -NoProfile -Command "if (Test-Path 'server\uploads\*') { Compress-Archive -Path 'server\uploads\*' -DestinationPath 'backups\uploads_%STAMP%.zip' -Force }"

echo.
echo Backup saved in the backups folder:
dir /b backups\*%STAMP%*
echo Copy the backups folder to another drive or computer regularly.
pause
