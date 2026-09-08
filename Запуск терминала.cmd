@echo off
chcp 65001 >nul
title MT5 Terminal - запуск
cd /d "%~dp0"

echo.
echo   MT5 Terminal — локальный запуск для показа
echo   ------------------------------------------
echo.

echo   [1/3] База данных...
call npm run db:start >nul 2>&1
echo   [1/3] База данных — готово.
echo.

echo   [2/3] Сайт и сервер (откроется отдельное окно с логами)...
start "MT5 Terminal — сервер (не закрывать)" cmd /k "npm run dev"
echo.

echo   [3/3] Жду запуск и открываю браузер...
timeout /t 8 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo   Готово. Сайт: http://localhost:3000   Админка: http://localhost:3000/admin
echo   Вход: любой логин, пароль demo. Админка: admin / admin123
echo.
echo   Чтобы всё выключить — запусти «Стоп терминала».
echo.
timeout /t 6 >nul
