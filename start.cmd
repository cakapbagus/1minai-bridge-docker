@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum ditemukan. Instal Node.js 22 atau lebih baru.
  pause
  exit /b 1
)
if not exist config.local.json node setup.mjs
if not exist config.local.json (
  pause
  exit /b 1
)
node bridge.mjs
pause
