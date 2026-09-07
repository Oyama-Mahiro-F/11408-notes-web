@echo off
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  python push.py
  goto end
)
if exist "D://python//python.exe" (
  "D://python//python.exe" push.py
  goto end
)
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 push.py
  goto end
)
echo [ERROR] Python not found. Install Python or fix PATH.
:end
pause
