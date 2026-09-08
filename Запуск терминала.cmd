@echo off
title MT5 Terminal
cd /d "%~dp0"

echo.
echo   MT5 Terminal - local start
echo   =========================
echo.
echo   Keep this window open while showing the terminal.
echo   To stop everything: close this window or run "Stop terminal".
echo.

echo   Starting database...
call npm run db:start >nul 2>&1

echo   Browser opens in ~10 seconds. Starting site and server...
echo.
start "" cmd /c "ping -n 11 127.0.0.1 >nul & start "" http://localhost:3000"

call npm run dev

echo.
echo   Stopped. You can close this window.
pause >nul
