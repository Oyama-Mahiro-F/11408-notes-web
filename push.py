import os, subprocess, shutil, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, 'site')
SOURCE = os.path.join(ROOT, '考研')

def run(cmd, cwd=ROOT):
    print(f'  $ {cmd}')
    r = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        if r.stderr:
            print(f'  Error: {r.stderr.strip()}')
        if 'nothing to commit' not in r.stdout and 'nothing to commit' not in r.stderr:
            return False
    return True

def main():
    print('===== 考研笔记推送 =====')

    # 1. Copy HTML files
    print('[1/4] 复制 HTML...')
    for sub in ['数学/高数', '数学/线性代数']:
        src_dir = os.path.join(SOURCE, sub)
        dst_dir = os.path.join(SITE, sub)
        os.makedirs(dst_dir, exist_ok=True)
        if os.path.isdir(src_dir):
            for f in os.listdir(src_dir):
                if f.endswith('.html'):
                    shutil.copy2(os.path.join(src_dir, f), os.path.join(dst_dir, f))
    print('  完成.')

    # 2. Generate nav
    print('[2/4] 生成导航...')
    r = subprocess.run([sys.executable, 'add_nav.py'], cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        print(f'  失败: {r.stderr}')
        input('按回车退出...')
        return
    print('  完成.')

    # 3. Git commit
    print('[3/4] 提交...')
    for path in ['site/数学', '考研', 'add_nav.py', 'site/index.html']:
        subprocess.run(f'git add "{path}"', shell=True, cwd=ROOT, capture_output=True)

    r = subprocess.run('git diff --cached --quiet', shell=True, cwd=ROOT)
    if r.returncode == 0:
        print('  没有新变更，跳过推送。')
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
