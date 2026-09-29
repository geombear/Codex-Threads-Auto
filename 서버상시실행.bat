@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ThreadsStudioServer
rem 서버가 종료되면 10초 뒤 자동으로 다시 켭니다. 자동실행등록.bat 가 부팅 시 이 파일을 실행합니다.
rem 작업 스케줄러에서는 콘솔 입력이 없어 timeout 대신 ping 으로 대기합니다.
set "PORT=4310"
set "LOGDIR=%~dp0logs"
set "LOG=%LOGDIR%\server.log"
set "STOP=%~dp0data\stop-request"

if not exist "%LOGDIR%" mkdir "%LOGDIR%"
if exist "%STOP%" del "%STOP%" >nul 2>&1

where node >nul 2>&1
if errorlevel 1 (
  call :log "[오류] Node.js를 찾을 수 없습니다. Node.js 24 LTS를 설치하세요."
  exit /b 1
)
if not exist "node_modules\" (
  call :log "[오류] 설치되지 않았습니다. 시작실행.bat 를 먼저 실행하세요."
  exit /b 1
)
if not exist "dist\index.html" (
  call :log "[오류] 화면이 빌드되지 않았습니다. 시작실행.bat 를 먼저 실행하세요."
  exit /b 1
)

echo 서버를 상시 실행합니다. 종료되면 자동으로 다시 켭니다.
echo 기록: %LOG%
echo 끄려면 서버끄기.bat 를 실행하세요.
echo.
set "WAITING=0"

:loop
if exist "%STOP%" goto stopped
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  if "%WAITING%"=="0" call :log "포트 %PORT% 에 이미 서버가 켜져 있어 대기합니다. 그 서버가 꺼지면 이어받습니다."
  set "WAITING=1"
  ping -n 61 127.0.0.1 >nul
  goto loop
)
set "WAITING=0"

for %%A in ("%LOG%") do if %%~zA GTR 10485760 move /y "%LOG%" "%LOGDIR%\server.old.log" >nul
call :log "서버 시작"
call npm.cmd start >> "%LOG%" 2>&1
call :log "서버가 종료되었습니다."
if exist "%STOP%" goto stopped
call :log "10초 후 다시 켭니다."
ping -n 11 127.0.0.1 >nul
goto loop

:stopped
del "%STOP%" >nul 2>&1
call :log "서버끄기 요청으로 상시 실행을 멈춥니다."
exit /b 0

:log
echo [%date% %time%] %~1
echo [%date% %time%] %~1>> "%LOG%"
exit /b 0
