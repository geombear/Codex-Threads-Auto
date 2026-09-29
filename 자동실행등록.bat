@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Threads Studio 자동 실행 등록

net session >nul 2>&1
if errorlevel 1 (
  echo 관리자 권한이 필요합니다. 승인 창이 뜨면 [예]를 누르세요.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%USERDOMAIN%\%USERNAME%' -Verb RunAs"
  exit /b 0
)

set "RUNUSER=%~1"
if "%RUNUSER%"=="" set "RUNUSER=%USERDOMAIN%\%USERNAME%"

echo PC가 켜지면 로그인하지 않아도 서버가 자동으로 켜지도록 등록합니다.
echo 실행 계정: %RUNUSER%
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\autostart.ps1" -Runner "%~dp0서버상시실행.bat" -User "%RUNUSER%"
if errorlevel 1 (
  echo.
  echo [오류] 등록에 실패했습니다. 위 메시지를 확인하세요.
  pause
  exit /b 1
)

echo.
echo 등록했습니다. 부팅 1분 뒤 서버가 켜지고, 꺼지면 자동으로 다시 켜집니다.
echo 서버 창은 보이지 않습니다. 기록은 logs\server.log 에 남습니다.
echo 작업실 주소: http://127.0.0.1:4310
echo 해제하려면 자동실행해제.bat 를 실행하세요.
pause
exit /b 0
