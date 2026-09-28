@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Threads Studio 시작 실행

echo.
echo  Threads Studio 처음 설치 및 화면 빌드
echo  폴더: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [오류] Node.js가 없습니다. Node.js 24 LTS를 설치한 뒤 다시 실행하세요.
  goto end
)

echo [1/2] 패키지 설치 중...
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 (
  echo [오류] 패키지 설치에 실패했습니다.
  goto end
)

echo [2/2] 화면 빌드 중...
call npm.cmd run build
if errorlevel 1 (
  echo [오류] 빌드에 실패했습니다.
  goto end
)

echo.
echo  설치가 끝났습니다. 이제 서버켜기.bat 로 작업실을 여세요.
echo.
:end
pause
