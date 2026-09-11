@echo off
rem ============================================
rem  Vegetable Duel - one-click launcher
rem  ASCII only on purpose: cmd.exe mis-parses
rem  multi-byte UTF-8 batch files.
rem  All Chinese UI text is printed by tools\launch.mjs
rem ============================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install it first: https://nodejs.org/
  pause
  exit /b 1
)

node tools\launch.mjs
if errorlevel 1 pause
