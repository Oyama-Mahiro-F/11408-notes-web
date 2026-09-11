# -*- coding: utf-8 -*-
"""
笔记站同步脚本：镜像 考研/ 学科目录树 → site（基于 md 的笔记网站）
- 镜像收录学科目录下全部 md（根目录直属 md 忽略；试卷/参考/课件等排除）
- 拷贝 .md 及其引用的图片目录；残留清理以「源镜像全集」为基准
- 生成 manifest.json（目录树）与 search/{科目}.json（搜索索引）

用法：python sync.py
"""
import json
import os
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "考研"          # D:/university_learning/考研

# 收录规则：镜像 考研/ 下的一级学科目录（408/数学/英语/政治…）全部子结构
# - 考研/ 根目录直属的 md 忽略（培养方案/规则文档等非笔记文件）
# - 试卷 目录不收录；目录/文件名命中 EXCLUDE_PAT 的排除
EXCLUDE_PAT = ("参考", "校对报告", "校对总报告", "课件", "合订版", "~$", "AGENTS", "试卷")
SKIP_TOP = {"试卷"}
# site 仓库内非内容目录（残留清理时不进这些目录）
NON_CONTENT_DIRS = {"vendor", "css", "js", "search", "node_modules",
                    "_shots", "_edge_profile", "docs", ".github"}
# 仓库内源文件（不在考研/源里，同步时保留并并入目录树与搜索索引）
EXTRA_FILES = {"思维导图大纲.md", "复习自查.md"}

SUBJECT_META = [
    ("408", "408", "💻"),
    ("数学", "数学", "📐"),
    ("英语", "英语", "📖"),
    ("政治", "政治", "📋"),   # 无 md，仅首页卡片占位
]

IMG_RE = re.compile(r"!\[[^\]]*\]\(([^)\s][^)]*?)\)")
HTMLIMG_RE = re.compile(r"<img[^>]+src=[\"']([^\"']+)[\"']", re.I)


def excluded(name: str) -> bool:
    return any(p in name for p in EXCLUDE_PAT)


def natural_key(s: str):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def collect_mds():
    """镜像 考研/ 学科目录树：返回 [(src_md_path, rel_path_str)]
    根目录直属 md 忽略；试卷与命中排除项不收录"""
    out = []
    for root, dirs, files in os.walk(SRC):
        rel_root = Path(root).relative_to(SRC)
        if str(rel_root) == '.':
            # 根目录：忽略直属 md，只下钻学科目录
            dirs[:] = [d for d in dirs
                       if not d.startswith('.') and d not in SKIP_TOP]
            continue
        dirs[:] = [d for d in dirs
                   if not d.startswith('.') and not excluded(d)]
        for f in files:
            if not f.endswith('.md') or excluded(f):
                continue
            rel = (rel_root / f).as_posix()
            out.append((Path(root) / f, rel))
    out.sort(key=lambda t: natural_key(t[1]))
    return out


def copy_md(md_src: Path, rel: str):
    dst = HERE / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(md_src, dst)
    text = md_src.read_text("utf-8", errors="ignore")
    # 收集引用到的任意本地资源目录（X.assets / assets 均可）
    dirs = set()
    for m in IMG_RE.findall(text) + HTMLIMG_RE.findall(text):
        d = m.strip().replace("\\", "/").lstrip("/")
        if not d or d.lower().startswith(("http:", "https:", "data:", "#")):
            continue
        if ".." in d.split("/"):
            continue
        top = d.split("/")[0]
        if (md_src.parent / top).is_dir():
            dirs.add(top)
    # 兜底：同名 .assets 一并拷贝
    sibling = md_src.with_suffix(".assets")
    if sibling.is_dir():
        dirs.add(sibling.name)
    for name in dirs:
        src_dir = md_src.parent / name
        dst_dir = dst.parent / name
        if src_dir.is_dir():
            shutil.copytree(src_dir, dst_dir, dirs_exist_ok=True)


def strip_md(text: str) -> str:
    text = IMG_RE.sub(" ", text)                          # 图片
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)  # 链接留文字
    text = re.sub(r"[#>*`~_|]{1,}", " ", text)            # markdown 符号
    text = re.sub(r"\\[a-zA-Z]+", " ", text)              # TeX 命令（\iiint 等）
    text = re.sub(r"[${}\\]", " ", text)                  # 定界符与括号
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def build_search(pages):
    """subject -> {pages:[{title,path,text}]}"""
    idx = {}
    for rel, title in pages:
        subj = rel.split("/")[0]
        text = strip_md((HERE / rel).read_text("utf-8", errors="ignore"))
        idx.setdefault(subj, {"pages": []})
        idx[subj]["pages"].append({"title": title, "path": rel, "text": text})
    for subj, data in idx.items():
        out = HERE / "search" / f"{subj}.json"
        out.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
        print(f"  search/{subj}.json  {len(data['pages'])} 页, "
              f"{out.stat().st_size // 1024} KB")
    return idx


def build_manifest(mds):
    """目录树：仅包含已同步的 md 文件"""
    tree = {}
    for _, rel in mds:
        parts = rel.split("/")
        node = tree
        for i, part in enumerate(parts):
            is_file = i == len(parts) - 1
            key = part
            node = node.setdefault(key, {} if not is_file else {"__file__": rel})
    subjects = []
    for subj, _, icon in SUBJECT_META:
        if subj not in tree:
            continue
        subjects.append({"name": subj, "icon": icon,
                         "children": to_nodes(tree[subj])})
    return {"subjects": subjects}


def to_nodes(d):
    nodes = []
    for name, val in d.items():
        if isinstance(val, dict) and "__file__" in val:
            nodes.append({"name": name.replace(".md", ""),
                          "path": val["__file__"], "children": []})
        else:
            nodes.append({"name": name, "path": None,
                          "children": to_nodes(val)})
    nodes.sort(key=lambda n: (n["path"] is None and 1 or 0,
                              0 if n["path"] is None else 1,
                              natural_key(n["path"] or n["name"])))
    return nodes


def mirror_files():
    """源目录镜像全集（含图片等全部文件）——残留清理的 keep 基准"""
    keep = set()
    for root, dirs, files in os.walk(SRC):
        rel_root = Path(root).relative_to(SRC)
        if str(rel_root) == '.':
            dirs[:] = [d for d in dirs
                       if not d.startswith('.') and d not in SKIP_TOP]
            continue
        dirs[:] = [d for d in dirs
                   if not d.startswith('.') and not excluded(d)]
        for f in files:
            if excluded(f):
                continue
            keep.add((rel_root / f).as_posix())
    return keep


def collect_extras():
    """扫描仓库内自建文件（EXTRA_FILES，任意深度），返回相对路径列表"""
    rels = set()
    for subj, _, _ in SUBJECT_META:
        base = HERE / subj
        if not base.is_dir():
            continue
        for root, dirs, files in os.walk(base):
            for f in files:
                if f in EXTRA_FILES:
                    rels.add((Path(root) / f).relative_to(HERE).as_posix())
    return sorted(rels)


def cleanup_stale(keep):
    """删除镜像集合之外的残留文件/空目录（仓库内源文件 EXTRA_FILES 跳过）"""
    print('[清理] 扫描残留文件...')
    deleted = 0
    roots = [d for d in HERE.iterdir()
             if d.is_dir() and not d.name.startswith('.')
             and d.name not in NON_CONTENT_DIRS]
    for site_dir in roots:
        for root, dirs, files in os.walk(site_dir, topdown=False):
            rel_root = Path(root).relative_to(HERE)
            for f in files:
                rel = (rel_root / f).as_posix()
                if rel in keep or f in EXTRA_FILES:
                    continue
                (Path(root) / f).unlink()
                deleted += 1
            if not dirs and not files:
                try:
                    os.rmdir(root)
                except OSError:
                    pass
    print('  残留 %d 个。' % deleted)
    print()


def main():
    if not SRC.exists():
        print(f"源目录不存在: {SRC}")
        sys.exit(1)
    mds = collect_mds()
    print(f"共收录 {len(mds)} 个 md 文件")
    for src, rel in mds:
        copy_md(src, rel)
    # 复习自查/思维导图大纲等是仓库内源文件（不在考研/源里），并入索引与目录树
    # 源目录里已有同名笔记的以源为准，不再按仓库自建文件重复收录
    synced_rels = {rel for _, rel in mds}
    extras = [rel for rel in collect_extras() if rel not in synced_rels]
    keep = mirror_files() | synced_rels | set(extras)
    cleanup_stale(keep)
    pages = [(rel, Path(rel).stem) for _, rel in mds] + \
            [(rel, Path(rel).stem) for rel in extras]
    print("生成搜索索引:")
    build_search(pages)
    manifest = build_manifest([(None, rel) for rel, _ in pages])
    (HERE / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), "utf-8")
    n = sum(1 for rel, _ in pages)
    print(f"manifest.json 完成，共 {n} 页。")
    # 校验：确认存在矩阵/三重积分等公式页
    for probe in ("数学/线性代数/第2章 矩阵.md",
                  "数学/高数/基础/第9章 三重积分.md"):
        print(f"  {'✓' if (HERE / probe).exists() else '✗ 缺失'} {probe}")


if __name__ == "__main__":
    main()
