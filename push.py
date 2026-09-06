# -*- coding: utf-8 -*-
"""
一键部署（md 版）：sync.py 同步笔记 → git commit → git push → GitHub Pages 自动部署
用法：双击 push.bat 或 python push.py
"""
import subprocess
import sys
import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
PAGES_URL = "https://oyama-mahiro-f.github.io/11408-notes-web/"


def run(cmd):
    print("  $", " ".join(cmd))
    r = subprocess.run(cmd, cwd=HERE, capture_output=True,
                       encoding="utf-8", errors="replace")
    out = ((r.stdout or "") + (r.stderr or "")).strip()
    if out:
        print("\n".join("  " + line for line in out.splitlines()[-6:]))
    return r.returncode, out


def main():
    r = subprocess.run([sys.executable, str(HERE / "sync.py")])
    if r.returncode:
        sys.exit("同步失败，终止推送")

    run(["git", "add", "-A"])
    rc, out = run(["git", "commit", "-m",
                   "更新笔记 " + datetime.date.today().isoformat()])
    if rc != 0 and "nothing to commit" not in out:
        sys.exit("提交失败（详见上方输出）；若提示 dubious ownership，"
                 "执行 git config --global --add safe.directory " + str(HERE))
    rc, _ = run(["git", "push"])
    if rc != 0:
        sys.exit("推送失败，请检查网络或凭据")
    print("\n✓ 已推送，GitHub Pages 部署中：" + PAGES_URL)


if __name__ == "__main__":
    main()
