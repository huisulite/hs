@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 批量验证码获取工具
echo 正在启动批量验证码获取工具...
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js，请先安装 Node.js 后再运行。
  echo 下载地址：https://nodejs.org/
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo 未检测到 npm，请检查 Node.js 是否安装完整。
  pause
  exit /b 1
)
if not exist node_modules (
  echo 首次启动正在安装依赖，请稍等...
  npm install
  if errorlevel 1 (
    echo 依赖安装失败，请检查网络或 npm 环境。
    pause
    exit /b 1
  )
)
echo.
echo 本机访问：http://localhost:5173/
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1 -ExpandProperty IPAddress)"`) do echo 局域网访问：http://%%i:5173/
echo.
echo 如局域网无法访问，请允许 Windows 防火墙放行 Node.js。
echo.
start "" "http://localhost:5173/"
npm run dev
pause
