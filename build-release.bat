@echo off
setlocal EnableExtensions
title Manga Reader - Build Installer
cd /d "%~dp0"

if not exist node_modules ( call npm install )

echo Building Windows installer... this takes a couple minutes.
call npm run build

echo.
echo Done. Output is under: release\
explorer release
pause