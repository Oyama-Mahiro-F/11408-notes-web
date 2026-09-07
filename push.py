# -*- coding: utf-8 -*-
"""
考研笔记 → GitHub Pages 一键推送（Markdown 直渲染版）
用法：双击 push.bat 或执行 python push.py
流程：[1/3] sync.py 同步笔记与索引 → [2/3] git 提交 → [3/3] git push → Pages 自动部署
"""
import subprocess
import sys
import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / '考研'
SITE_URL = 'https://oyama-mahiro-f.github.io/11408-notes-web/'
REPO_SSH = 'git@github.com:Oyama-Mahiro-F/11408-notes-web.git'


def pause(msg='按回车退出...'):
    try:
        input(msg)
    except EOFError:
        pass


def run(cmd, timeout=None, check=True):
    """执行命令，打印输出；'nothing to commit' 不算失败"""
    cmd = [str(c) for c in cmd]
    print('  $ ' + ' '.join(cmd))
    try:
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, timeout=timeout,
                           encoding='utf-8', errors='replace')
    except subprocess.TimeoutExpired:
        print('  [超时] 命令超过 %s 秒未完成' % timeout)
        return 1, 'timeout'
    out = ((r.stdout or '') + (r.stderr or '')).strip()
    if out:
        print('\n'.join('    ' + line for line in out.splitlines()[-8:]))
    if r.returncode != 0 and check:
        if 'nothing to commit' in out or 'dubious ownership' in out:
            return 0, out
        return r.returncode, out
    return r.returncode, out


def fix_safe_directory():
    """修复 git dubious ownership 问题"""
    print('[预检] 检查目录权限...')
    rc, out = run(['git', 'status'], check=False)
    if 'dubious ownership' in out:
        run(['git', 'config', '--global', '--add', 'safe.directory', str(ROOT)], check=False)
        print('  [OK] 已添加 safe.directory')
    else:
        print('  [OK] 正常')
    print()


def check_git_user():
    """检查 git 身份；未配置则引导设置"""
    print('[预检] 检查 Git 用户配置...')
    _, name = run(['git', 'config', 'user.name'], check=False)
    _, email = run(['git', 'config', 'user.email'], check=False)
    name, email = name.strip(), email.strip()
    if name and email:
        print('  [OK] %s <%s>' % (name, email))
        print()
        return True
    print('  [警告] Git 用户信息未配置（提交需要）')
    try:
        if not name:
            name = input('  请输入 GitHub 用户名: ').strip()
        if not email:
            email = input('  请输入 GitHub 邮箱: ').strip()
    except EOFError:
        pass
    if name and email:
        run(['git', 'config', 'user.name', name], check=False)
        run(['git', 'config', 'user.email', email], check=False)
        print('  [OK] 已设置: %s <%s>' % (name, email))
        print()
        return True
    print('  [跳过] 未输入，提交时可能失败')
    print()
    return False


def check_git_remote():
    """确认远程可达；HTTPS 一律切 SSH（HTTPS 凭据助手会挂起，SSH 已走 443）"""
    print('[预检] 检查 GitHub 远程...')
    rc, url = run(['git', 'remote', 'get-url', 'origin'], check=False)
    if rc != 0:
        print('  [错误] 未找到远程 origin')
        return False
    url = url.strip().splitlines()[-1]
    if 'git@' not in url:
        print('  当前为 HTTPS（凭据助手可能挂起），切换为 SSH...')
        run(['git', 'remote', 'set-url', 'origin', REPO_SSH], check=False)
        url = REPO_SSH
    print('  远程地址: ' + url)
    print('  正在检测连接（最多 15 秒）...')
    rc, out = run(['git', 'ls-remote', '--exit-code', 'origin', 'HEAD'], timeout=15, check=False)
    if rc == 0:
        print('  [OK] GitHub 连接正常')
    else:
        print('  [警告] 预检未通过（%s），推送时还会重试' % ('超时' if out == 'timeout' else '连接失败'))
        print('  若推送也失败：检查网络，或确认 ~/.ssh/config 里 github.com 走 ssh.github.com:443')
    print()
    return True


def main():
    print('=' * 52)
    print('  考研笔记 → GitHub Pages 推送工具（md 直渲染版）')
    print('=' * 52)
    print()

    fix_safe_directory()
    check_git_user()
    if not check_git_remote():
        pause('修复后按回车重试，或直接关闭窗口退出...')
        return

    # ---- [1/3] 同步 ----
    print('[1/3] 同步 考研/ 笔记与索引（sync.py）...')
    r = subprocess.run([sys.executable, str(ROOT / 'sync.py')])
    if r.returncode != 0:
        print('  [失败] 同步出错，终止推送')
        pause()
        return
    print()

    # ---- [2/3] 提交 ----
    print('[2/3] Git 提交...')
    run(['git', 'add', '-A'], check=False)
    r = subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=ROOT)
    if r.returncode == 0:
        print('  没有新变更，跳过提交与推送。')
        pause()
        return
    msg = '更新笔记 ' + datetime.date.today().isoformat()
    rc, _ = run(['git', 'commit', '-m', msg])
    if rc != 0:
        print('  [失败] git commit 出错（若提示身份未配置请按预检提示设置）')
        pause()
        return
    print()

    # ---- [3/3] 推送 ----
    print('[3/3] 推送到 GitHub...')
    try:
        r = subprocess.run(['git', 'push', 'origin', 'main'], cwd=ROOT)
    except KeyboardInterrupt:
        r = None
    if not r or r.returncode != 0:
        print()
        print('  [推送失败] 常见原因:')
        print('    1. 网络问题 — 浏览器访问 github.com 试试')
        print('    2. SSH 22 端口超时 — 确认 ~/.ssh/config 已配置 ssh.github.com:443')
        print('    3. 首次推送需授权 — 在弹出的窗口中登录')
        print('    4. 远程有新提交 — 先 git pull 再 push')
        pause()
        return

    print()
    print('=' * 52)
    print('  ✓ 推送成功！')
    print('  网站: ' + SITE_URL)
    print('  （Pages 部署约需 30 秒，稍后刷新即可看到更新）')
    print('=' * 52)
    pause()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n已取消。')
