@echo off
title MT5 Terminal - stop
cd /d "%~dp0"

echo.
echo   Stopping MT5 Terminal...
echo.

rem --- site and server (ports 3000/3001/4000) ---
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r ":300[01] :4000" ^| findstr LISTENING') do taskkill /f /pid %%p >nul 2>&1

rem --- database ---
call npm run db:stop >nul 2>&1

echo   Done. Everything is off.
echo.
ping -n 3 127.0.0.1 >nul 2>&1
