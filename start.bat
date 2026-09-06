@echo off
cd /d "%~dp0"
start "" /min cmd /c "ping -n 2 127.0.0.1 >nul & start http://127.0.0.1:8737/"
echo Serving site2 at http://127.0.0.1:8737/  (Ctrl+C to stop)
python -m http.server 8737 --bind 127.0.0.1
