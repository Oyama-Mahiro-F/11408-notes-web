"""
考研笔记推送脚本
用法：双击 push.bat 或执行 python push.py
功能：复制 考研/ → site/ → 生成导航 → git commit → git push → GitHub Pages 自动部署
"""
import os, subprocess, shutil, sys, glob

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = ROOT
SOURCE = os.path.join(os.path.dirname(ROOT), '考研')
REPO_URL_SSH = 'git@github.com:Oyama-Mahiro-F/11408-notes-web.git'
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


def run_interactive(cmd, cwd=ROOT):
    """执行需要用户交互的命令（如 git push 需要登录弹窗）"""
    print(f'  $ {cmd}')
    r = subprocess.run(cmd, shell=True, cwd=cwd)
    return r.returncode == 0


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

    # HTTPS 在国内容易被墙 → 自动切到 SSH
    if 'https://' in current_url:
        print('  检测到 HTTPS 地址，切换为 SSH（国内更稳定）...')
        run(f'git remote set-url origin {REPO_URL_SSH}', check=False)
        current_url = REPO_URL_SSH
        print(f'  已切换: {current_url}')

    # Test connection (with timeout — GitHub 国内有时慢)
    print('  正在检测连接（最多等待 10 秒）...')
    try:
        r = subprocess.run('git ls-remote --exit-code origin HEAD', shell=True, cwd=ROOT,
                           capture_output=True, encoding='utf-8', errors='replace', timeout=10)
        if r.returncode == 0:
            print('  [OK] GitHub 连接正常')
            return True
        err = (r.stderr or '').strip()
    except subprocess.TimeoutExpired:
        err = '连接超时'
    except Exception as e:
        err = str(e)

    print(f'  [警告] 预检未通过 ({err})，跳过检测，推送时重试。')
    print(f'  如果推送也失败，浏览器打开 https://github.com 检查网络。')
    return True  # 不阻塞，push 时还会再试


def cleanup_stale_files():
    """删除 site/ 内容目录中考研/已不存在的文件（处理重命名产生的残留）

    只扫描内容子目录（408/ 数学/ 英语/ 政治/），不触碰 site 根目录的脚本和生成的导航页。
    """
    print('[清理] 扫描残留文件...')
    CONTENT_DIRS = ['408', '数学', '英语', '政治']
    deleted = 0

    for content_dir in CONTENT_DIRS:
        site_dir = os.path.join(SITE, content_dir)
        source_dir = os.path.join(SOURCE, content_dir)
        if not os.path.isdir(site_dir):
            continue

        # 遍历内容目录，找 考研/ 中已不存在的文件
        for root, dirs, files in os.walk(site_dir):
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            for f in files:
                if f.startswith('.'):
                    continue
                site_path = os.path.join(root, f)
                rel = os.path.relpath(site_path, site_dir)
                source_path = os.path.join(source_dir, rel)

                if not os.path.exists(source_path):
                    print(f'  ✗ {content_dir}/{rel}')
                    os.remove(site_path)
                    deleted += 1

        # 清理空目录（自底向上）
        for root, dirs, files in os.walk(site_dir, topdown=False):
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            if not files and not dirs:
                rel = os.path.relpath(root, site_dir)
                if rel != '.':
                    try:
                        os.rmdir(root)
                    except OSError:
                        pass

    if deleted == 0:
        print('  没有残留。')
    else:
        print(f'  清理完成：{deleted} 个残留文件。')
    print()


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
    print('[1/5] 从 考研/ 复制 HTML 和图片到 site/ ...')
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

    # ---- 2. 清理残留文件 ----
    cleanup_stale_files()

    # ---- 3. 生成导航和索引页 ----
    print('[3/5] 生成导航和索引页...')
    r = subprocess.run([sys.executable, 'add_nav.py'], cwd=ROOT,
                       capture_output=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        print(f'  [失败] {r.stderr}')
        input('按回车退出...')
        return
    print('  完成。')
    print()

    # ---- 4. Git add & commit ----
    print('[4/5] Git 提交...')

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

    # ---- 5. Push ----
    print('[5/5] 推送到 GitHub（如需登录请在弹出的窗口中授权）...')
    if not run_interactive('git push origin main'):
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
