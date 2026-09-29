@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Threads Studio 서버 끄기
set "PORT=4310"
set "WIN=ThreadsStudioServer"
set "KILLED=0"

echo 포트 %PORT% 서버를 끕니다...

rem 서버상시실행.bat 가 다시 켜지 않도록 중지 요청을 남깁니다.
if not exist "data\" mkdir "data"
echo stop> "data\stop-request"

taskkill /FI "WINDOWTITLE eq %WIN%" /T /F >nul 2>&1
if not errorlevel 1 set "KILLED=1"

for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  if not "%%P"=="0" (
    taskkill /PID %%P /T /F >nul 2>&1
    if not errorlevel 1 set "KILLED=1"
  )
)

timeout /t 1 /nobreak >nul
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo [오류] 포트 %PORT% 가 아직 사용 중입니다. 작업 관리자에서 node.exe를 확인하세요.
  pause
  exit /b 1
)

if "%KILLED%"=="1" (
  echo 서버를 껐습니다.
) else (
  echo 켜져 있는 서버가 없었습니다.
)
timeout /t 2 /nobreak >nul
exit /b 0
