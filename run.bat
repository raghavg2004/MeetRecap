@echo off
setlocal EnableExtensions

title MeetRecap PWA Launcher
color 0A
cls

cd /d "%~dp0"

echo ========================================
echo   MeetRecap
echo ========================================
echo.
echo   Project: %CD%
echo   Action : Starting development server
echo.

where node >nul 2>nul
if errorlevel 1 (
	color 0C
	echo [ERROR] Node.js was not found on PATH.
	echo Install Node.js, then run this file again.
	echo.
	pause
	exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
	color 0C
	echo [ERROR] npm was not found on PATH.
	echo Reinstall Node.js or repair your Node.js setup, then try again.
	echo.
	pause
	exit /b 1
)

echo [OK] Environment ready.
echo [INFO] Launching server...
echo.

call npm start

echo.
echo [INFO] The server has stopped.
pause