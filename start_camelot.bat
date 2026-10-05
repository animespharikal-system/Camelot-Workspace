@echo off
setlocal
cd /d "%~dp0"
start "Camelot Backend" cmd /k "cd /d "%~dp0backend" && ..venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
start "Camelot Frontend" cmd /k "cd /d "%~dp0frontend" && npm.cmd run dev"
timeout /t 3 /nobreak >nul
start "" http://localhost:5173
