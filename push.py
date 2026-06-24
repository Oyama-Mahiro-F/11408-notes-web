"""
考研笔记推送脚本
用法：双击 push.bat 或执行 python push.py
功能：复制 考研/ → site/ → 生成导航 → git commit → git push → GitHub Pages 自动部署
"""
import os, subprocess, shutil, sys, glob

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = ROOT
SOURCE = os.path.join(os.path.dirname(ROOT), '考研')
REPO_URL_HTTPS = 'https://github.com/Oyama-Mahiro-F/11408-notes-web.git'
SITE_URL = 'https://oyama-mahiro-f.github.io/11408-notes-web/'


def run(cmd, cwd=ROOT, check=True):
    """执行 shell 命令，返回 (success, output_text)"""
    print(f'  $ {cmd}')
    r = subprocess.run(cmd, shell=True, cwd=cwd,
                       capture_output=True, encoding='utf-8', errors='replace')
    out = (r.stdout or '').strip()
    err = (r.stderr or '').strip()
    if r.returncode != 0 and check:
        # "nothing to commit" / "dubious ownership" are not fatal
        if any(kw in out or kw in err for kw in ('nothing to commit', 'dubious ownership')):
            return True, out
        if err:
            print(f'  [错误] {err}')
        return False, err
    return True, out


def fix_safe_directory():
    """修复换电脑后 git dubious ownership 问题"""
    r = subprocess.run('git status', shell=True, cwd=ROOT,
                       capture_output=True, encoding='utf-8', errors='replace')
    if 'dubious ownership' in (r.stderr or '') or 'dubious ownership' in (r.stdout or ''):
        print('[预检] 修复目录权限...')
        subprocess.run(f'git config --global --add safe.directory "{ROOT}"', shell=True)
        path = ROOT.replace('\\', '/')
        print(f'  已添加 safe.directory: {path}')


def check_git_user():
    """检查 git user.name / user.email 是否配置；未配置则引导设置"""
    print('[预检] 检查 Git 用户配置...')
    name = ''
    email = ''
    try:
        r = subprocess.run('git config user.name', shell=True, cwd=ROOT,
                           capture_output=True, encoding='utf-8', errors='replace')
        name = (r.stdout or '').strip()
        r = subprocess.run('git config user.email', shell=True, cwd=ROOT,
                           capture_output=True, encoding='utf-8', errors='replace')
        email = (r.stdout or '').strip()
    except Exception:
        pass

    if name and email:
        print(f'  [OK] {name} <{email}>')
        return True

    print('  [警告] Git 用户信息未配置，提交时需要。')
    if not name:
        name = input('  请输入你的 GitHub 用户名: ').strip()
    if not email:
        email = input('  请输入你的 GitHub 邮箱: ').strip()
    if name and email:
        subprocess.run(f'git config user.name "{name}"', shell=True, cwd=ROOT)
        subprocess.run(f'git config user.email "{email}"', shell=True, cwd=ROOT)
        print(f'  [OK] 已设置: {name} <{email}>')
        return True
    print('  [跳过] 未输入，提交时可能失败。')
    return False


def check_git_remote():
    """检查是否能连接到 GitHub，自动切换 HTTPS"""
    print('[预检] 检查 GitHub 连接...')
    ok, out = run('git remote get-url origin', check=False)
    if not ok:
        print('  [错误] 未找到远程仓库 origin')
        return False

    current_url = out.strip()
    print(f'  远程地址: {current_url}')

    # 重装系统后 SSH 密钥丢失 → 自动切到 HTTPS
    if 'git@' in current_url or 'ssh:' in current_url:
        print('  检测到 SSH 地址，切换为 HTTPS（重装系统后无需配置密钥）...')
        run(f'git remote set-url origin {REPO_URL_HTTPS}', check=False)
        current_url = REPO_URL_HTTPS
        print(f'  已切换: {current_url}')

    # Test connection
    ok, out = run('git ls-remote --exit-code origin HEAD', check=False)
    if ok:
        print('  [OK] GitHub 连接正常')
        return True

    print('  [错误] 无法连接到 GitHub！')
    print()
    print('  修复方法：')
    print('  1. 打开浏览器，访问 https://github.com 确认网络通畅')
    print('  2. Git 首次推送时会弹出 GitHub 登录窗口（Git Credential Manager）')
    print('     选择 "Sign in with your browser" 授权即可')
    print(f'  3. 或手动: git remote set-url origin {REPO_URL_HTTPS}')
    return False


def main():
    print('=' * 50)
    print('  考研笔记 → GitHub Pages 推送工具')
    print('=' * 50)
    print()

    # ---- 预检 ----
    fix_safe_directory()
    if not check_git_user():
        print('  [警告] 继续执行，但 git commit 可能失败...')
        print()
    if not check_git_remote():
        print()
        input('修复后按回车重试，或直接关闭窗口退出...')
        return
    print()

    # ---- 1. 复制 HTML 和资源文件 ----
    print('[1/4] 从 考研/ 复制 HTML 和图片到 site/ ...')
    copied = 0
    for root, dirs, files in os.walk(SOURCE):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('site', '__pycache__')]
        rel_dir = os.path.relpath(root, SOURCE)
        if rel_dir == '.':
            rel_dir = ''
        dst_dir = os.path.join(SITE, rel_dir)
        for f in files:
            if f.startswith('.'):
                continue
            ext = os.path.splitext(f)[1].lower()
            if ext in ('.html', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js'):
                os.makedirs(dst_dir, exist_ok=True)
                src = os.path.join(root, f)
                dst = os.path.join(dst_dir, f)
                shutil.copy2(src, dst)
                copied += 1
    print(f'  完成，共复制 {copied} 个文件。')
    print()

    # ---- 2. 生成导航和索引页 ----
    print('[2/4] 生成导航和索引页...')
    r = subprocess.run([sys.executable, 'add_nav.py'], cwd=ROOT,
                       capture_output=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        print(f'  [失败] {r.stderr}')
        input('按回车退出...')
        return
    print('  完成。')
    print()

    # ---- 3. Git add & commit ----
    print('[3/4] Git 提交...')

    # Add all changed files (more robust than hardcoded paths)
    ok, _ = run('git add -A', check=False)
    if not ok:
        print('  [失败] git add 出错')
        input('按回车退出...')
        return

    # Check if there's anything to commit
    r = subprocess.run('git diff --cached --quiet', shell=True, cwd=ROOT)
    if r.returncode == 0:
        print('  没有新变更，跳过提交。')
        input('按回车退出...')
        return

    ok, _ = run('git commit -m "更新笔记"')
    if not ok:
        print('  [失败] git commit 出错')
        input('按回车退出...')
        return
    print('  完成。')
    print()

    # ---- 4. Push ----
    print('[4/4] 推送到 GitHub...')
    ok, _ = run('git push origin main')
    if not ok:
        print()
        print('  [推送失败] 常见原因:')
        print('    1. 网络问题 — 浏览器访问 github.com 试试')
        print('    2. 首次推送需授权 — 弹出的 GitHub 登录窗口点 "Sign in with browser"')
        print('    3. 远程有冲突 — 先 git pull 再 git push')
        input('按回车退出...')
        return

    print()
    print('=' * 50)
    print('  ✓ 推送成功！')
    print(f'  网站: {SITE_URL}')
    print('  (等待约 1 分钟后刷新页面即可看到更新)')
    print('=' * 50)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n已取消。')
    except Exception as e:
        print(f'\n[异常] {e}')
    input('按回车退出...')
