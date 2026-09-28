@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Threads Studio 서버 켜기
set "PORT=4310"
set "URL=http://127.0.0.1:%PORT%"
set "WIN=ThreadsStudioServer"

where node >nul 2>&1
if errorlevel 1 (
  echo [오류] Node.js가 없습니다. Node.js 24 LTS를 설치하세요.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [안내] 아직 설치되지 않았습니다. 시작실행.bat 를 먼저 실행하세요.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo [안내] 화면이 아직 빌드되지 않았습니다. 시작실행.bat 를 먼저 실행하세요.
  pause
  exit /b 1
)

netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo 서버가 이미 켜져 있습니다. 브라우저를 엽니다.
  start "" "%URL%"
  timeout /t 2 /nobreak >nul
  exit /b 0
)

echo 서버를 켭니다. 이 창을 닫아도 서버 창은 따로 유지됩니다.
echo 끄려면 서버끄기.bat 를 실행하세요.
echo.
start "%WIN%" /D "%~dp0" cmd /k "title %WIN% & call npm.cmd start"

echo 서버가 준비될 때까지 잠시 기다립니다...
set /a tries=0
:wait
timeout /t 1 /nobreak >nul
set /a tries+=1
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 goto ready
if %tries% LSS 20 goto wait

echo [안내] 아직 접속이 안 되면 서버 창의 메시지를 확인하세요.
echo 주소: %URL%
pause
exit /b 1

:ready
start "" "%URL%"
echo 작업실을 열었습니다.  %URL%
timeout /t 2 /nobreak >nul
exit /b 0
