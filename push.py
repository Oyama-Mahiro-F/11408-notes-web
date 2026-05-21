import os, subprocess, shutil, sys, glob

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, 'site')
SOURCE = os.path.join(ROOT, '考研')

def run(cmd, cwd=ROOT):
    print(f'  $ {cmd}')
    r = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True,
                       encoding='utf-8', errors='replace')
    if r.returncode != 0:
        err = (r.stderr or '').strip()
        out = (r.stdout or '').strip()
        if 'nothing to commit' not in out and 'nothing to commit' not in err:
            if err:
                print(f'  Error: {err}')
            return False
    return True

def main():
    print('===== 考研笔记推送 =====')

    # 1. Recursively copy all HTML files from 考研/ to site/
    print('[1/4] 复制 HTML...')
    for root, dirs, files in os.walk(SOURCE):
        rel_dir = os.path.relpath(root, SOURCE)
        if rel_dir == '.':
            rel_dir = ''
        dst_dir = os.path.join(SITE, rel_dir)
        for f in files:
            if f.endswith('.html') and not f.startswith('.'):
                os.makedirs(dst_dir, exist_ok=True)
                src = os.path.join(root, f)
                dst = os.path.join(dst_dir, f)
                shutil.copy2(src, dst)
    print('  完成.')

    # 2. Generate nav and index pages
    print('[2/4] 生成导航...')
    r = subprocess.run([sys.executable, 'add_nav.py'], cwd=ROOT,
                       capture_output=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        print(f'  失败: {r.stderr}')
        input('按回车退出...')
        return
    print('  完成.')

    # 3. Git
    print('[3/4] 提交...')
    for path in ['site/', '考研/', 'add_nav.py']:
        subprocess.run(f'git add "{path}"', shell=True, cwd=ROOT,
                       capture_output=True, encoding='utf-8', errors='replace')

    r = subprocess.run('git diff --cached --quiet', shell=True, cwd=ROOT,
                       encoding='utf-8', errors='replace')
    if r.returncode == 0:
        print('  没有新变更，跳过推送。')
        input('按回车退出...')
        return

    if not run('git commit -m "更新笔记"'):
        print('  提交失败！')
        input('按回车退出...')
        return

    # 4. Push
    print('[4/4] 推送...')
    if not run('git push origin main'):
        print('  推送失败！检查网络。')
        input('按回车退出...')
        return

    print('===== 完成！=====')
    print('https://oyama-mahiro-f.github.io/11408-notes-web/')

if __name__ == '__main__':
    main()
    input('按回车退出...')
