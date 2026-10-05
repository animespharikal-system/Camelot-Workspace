@echo off
cd /d "%~dp0frontend"
if not exist node_modules npm.cmd install
npm.cmd run dev
