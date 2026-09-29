@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Threads Studio 자동 실행 해제

net session >nul 2>&1
if errorlevel 1 (
  echo 관리자 권한이 필요합니다. 승인 창이 뜨면 [예]를 누르세요.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\autostart.ps1" -Remove
if errorlevel 1 (
  echo [오류] 해제에 실패했습니다. 위 메시지를 확인하세요.
  pause
  exit /b 1
)

echo.
echo 부팅 시 자동 실행을 해제했습니다.
echo 지금 켜져 있는 서버는 그대로 동작합니다. 끄려면 서버끄기.bat 를 실행하세요.
pause
exit /b 0
