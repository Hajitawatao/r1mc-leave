@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Save to GitHub
set "BRANCH=main"
set "REPO_URL=https://github.com/Hajitawatao/r1mc-leave.git"

where git >nul 2>&1
if errorlevel 1 (
  echo Git for Windows is not installed. Download it from https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist ".git" (
  echo Creating a local Git repository...
  git init -b %BRANCH%
)

set "GEMAIL="
for /f "delims=" %%e in ('git config user.email 2^>nul') do set "GEMAIL=%%e"
if not defined GEMAIL git config user.email "meliodas2327@gmail.com"
set "GNAME="
for /f "delims=" %%n in ('git config user.name 2^>nul') do set "GNAME=%%n"
if not defined GNAME git config user.name "meliodas2327"

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo GitHub repository URL [Enter for %REPO_URL%]:
  set /p "REPO_URL=> "
  call git remote add origin "%%REPO_URL%%"
)

echo Checking GitHub...
git ls-remote --exit-code --heads origin %BRANCH% >nul 2>&1
set "LSR=%errorlevel%"
set "REMOTE=exists"
if "%LSR%"=="2" set "REMOTE=missing"
if not "%LSR%"=="0" if not "%LSR%"=="2" (
  echo Cannot reach the GitHub repository. Check the internet connection and your GitHub sign-in.
  pause
  exit /b 1
)

git rev-parse --verify HEAD >nul 2>&1
if errorlevel 1 if "%REMOTE%"=="exists" (
  echo Adopting the history already on GitHub, keeping your local files...
  git fetch origin %BRANCH%
  git reset --mixed FETCH_HEAD
  git branch -u origin/%BRANCH%
)

if "%REMOTE%"=="exists" (
  git pull --rebase --autostash origin %BRANCH%
  if errorlevel 1 (
    echo Could not merge the latest changes from GitHub. Resolve the conflict, then run this again.
    pause
    exit /b 1
  )
)

git add -A
git diff --cached --quiet
if errorlevel 1 goto commit

if "%REMOTE%"=="missing" goto push
set "AHEAD=0"
for /f %%c in ('git rev-list --count origin/%BRANCH%..HEAD 2^>nul') do set "AHEAD=%%c"
if not "%AHEAD%"=="0" goto push
echo Nothing new to save.
pause
exit /b 0

:commit
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"`) do set "STAMP=%%d"
set "MSG="
set /p "MSG=Describe your change (Enter = Update %STAMP%): "
if not defined MSG set "MSG=Update %STAMP%"
git commit -m "%MSG%"
if errorlevel 1 (
  echo Commit failed.
  pause
  exit /b 1
)

:push
git push -u origin %BRANCH%
if errorlevel 1 (
  echo Push failed. Check your GitHub sign-in, then run this again.
  pause
  exit /b 1
)
echo.
echo Saved to GitHub.
pause
