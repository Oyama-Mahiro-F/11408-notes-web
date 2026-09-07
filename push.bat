@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  python push.py
  goto end
)
if exist "D:\python\python.exe" (
  "D:\python\python.exe" push.py
  goto end
)
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 push.py
  goto end
)
echo [错误] 未找到 Python，请安装 Python 或检查 PATH
:end
pause
