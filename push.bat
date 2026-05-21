@echo off
chcp 65001 >nul
echo ===== 考研笔记推送脚本 =====

echo [1/4] 复制 HTML 文件...
if not exist "site\数学\高数" mkdir "site\数学\高数"
if not exist "site\数学\线性代数" mkdir "site\数学\线性代数"
xcopy /Y "考研\数学\高数\*.html" "site\数学\高数\" >nul
xcopy /Y "考研\数学\线性代数\*.html" "site\数学\线性代数\" >nul
echo 完成.

echo [2/4] 生成导航...
python3 add_nav.py
if %errorlevel% neq 0 (
    echo 导航生成失败！
    pause
    exit /b 1
)

echo [3/4] 提交到 Git...
git add "site/数学" "考研" add_nav.py "site/index.html"
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo 没有新变更，跳过提交和推送。
    pause
    exit /b 0
)
git commit -m "更新笔记"

echo [4/4] 推送到 GitHub...
git push origin main
if %errorlevel% neq 0 (
    echo 推送失败！请检查网络连接。
    pause
    exit /b 1
)

echo ===== 推送完成！ =====
echo https://oyama-mahiro-f.github.io/11408-notes-web/
pause
