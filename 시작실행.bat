@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Threads Studio 시작 실행
set "PORT=4310"

echo.
echo  Threads Studio 시작
echo  폴더: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [오류] Node.js가 없습니다. Node.js 24 LTS를 설치한 뒤 다시 실행하세요.
  goto fail
)

rem 이미 설치·빌드되어 있고 package-lock.json 이 바뀌지 않았으면 설치를 건너뜁니다.
if not exist "node_modules\.package-lock.json" goto install
if not exist "dist\index.html" goto install
powershell -NoProfile -Command "exit [int]((Get-Item 'package-lock.json').LastWriteTime -gt (Get-Item 'node_modules\.package-lock.json').LastWriteTime)"
if errorlevel 1 goto install
echo 이미 설치되어 있습니다. 서버를 켭니다.
echo.
goto start

:install
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo [안내] 설치가 필요하지만 서버가 켜져 있습니다. 서버끄기.bat 를 실행한 뒤 다시 실행하세요.
  goto fail
)

echo [1/2] 패키지 설치 중... 처음 한 번만 필요합니다.
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 (
  echo [오류] 패키지 설치에 실패했습니다.
  goto fail
)

echo [2/2] 화면 빌드 중...
call npm.cmd run build
if errorlevel 1 (
  echo [오류] 빌드에 실패했습니다.
  goto fail
)

echo.
echo  설치가 끝났습니다. 서버를 켭니다.
echo.

:start
call "%~dp0서버켜기.bat"
exit /b %errorlevel%

:fail
pause
exit /b 1
