@echo off
chcp 65001 >nul
title MT5 Terminal - остановка
cd /d "%~dp0"

echo.
echo   MT5 Terminal — остановка
echo   -----------------------
echo.

echo   [1/2] Останавливаю сайт и сервер...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r ":300[01] :4000" ^| findstr LISTENING') do taskkill /f /pid %%p >nul 2>&1
taskkill /f /im node.exe /fi "WINDOWTITLE eq MT5 Terminal*" >nul 2>&1
echo   [1/2] Сайт остановлен.
echo.

echo   [2/2] Останавливаю базу данных...
call npm run db:stop >nul 2>&1
echo   [2/2] База остановлена.
echo.

echo   Всё выключено.
timeout /t 4 >nul
