# -*- coding: utf-8 -*-
"""
site2 同步脚本：把 考研/ 下的 Markdown 笔记同步到 site2/（基于 md 的笔记网站）
- 拷贝 .md 文件及其引用的 *.assets 图片目录
- 生成 manifest.json（前端目录树）
- 生成 search/{408,数学,英语}.json（客户端搜索索引，纯文本 + bigram 由前端处理）

用法：python sync.py
"""
import json
import re
import shutil
import sys
from pathlib import Path
from datetime import datetime

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "考研"          # D:/university_learning/考研

# 收录规则：(科目根, [允许的相对子目录或 None=全部]，排除关键字)
INCLUDE = {
    "408": {
        "dirs": ["操作系统", "数据结构", "计算机组成原理", "计算机网络"],
        "extra_files": [],           # 数据结构/作业.md 由 rule 特判
    },
    "数学": {
        "dirs": ["高数", "线性代数", "概率与统计"],
        "extra_files": [],
    },
    "英语": {
        "dirs": ["单词", "语法"],
        "extra_files": [],
    },
}
# 任何目录/文件名含这些关键字即排除
EXCLUDE_PAT = ("参考", "校对报告", "课件", "合订版", "~$", "AGENTS")
# 单文件白名单（在排除规则之后仍然收录）
WHITELIST = {"作业.md"}

SUBJECT_META = [
    ("408", "408", "💻"),
    ("数学", "数学", "📐"),
    ("英语", "英语", "📖"),
    ("政治", "政治", "📋"),   # 无 md，仅首页卡片占位
]

IMG_RE = re.compile(r"!\[[^\]]*\]\(([^)\s][^)]*?)\)")
HTMLIMG_RE = re.compile(r"<img[^>]+src=[\"']([^\"']+)[\"']", re.I)


def excluded(name: str) -> bool:
    if name in WHITELIST:
        return False
    return any(p in name for p in EXCLUDE_PAT)


def natural_key(s: str):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def collect_mds():
    """返回 [(src_md_path, rel_path_str)]"""
    out = []
    for subj, rule in INCLUDE.items():
        root = SRC / subj
        if not root.exists():
            continue
        for d in rule["dirs"]:
            base = root / d
            if not base.exists():
                continue
            for p in base.rglob("*.md"):
                rel_parts = p.relative_to(SRC).parts
                # 排除路径中任一段命中关键字（作业.md 白名单除外）
                if any(excluded(part) for part in rel_parts[:-1]):
                    continue
                if excluded(p.name):
                    continue
                out.append((p, "/".join(rel_parts)))
        for f in rule["extra_files"]:
            p = root / f
            if p.exists():
                out.append((p, "/".join([subj, f])))
    # 特判：408/数据结构/作业.md
    hw = SRC / "408" / "数据结构" / "作业.md"
    if hw.exists() and not any(str(s) == str(hw) for s, _ in out):
        out.append((hw, "408/数据结构/作业.md"))
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
        if dst_dir.exists():
            shutil.rmtree(dst_dir)
        shutil.copytree(src_dir, dst_dir)


MINDMAP_SUBJECTS = ["操作系统", "数据结构", "计算机组成原理", "计算机网络"]


def stash_mindmaps():
    """wipe 前暂存大纲：优先取仓库内已有文件（大纲源即仓库自身），
    首次迁移时回退到旧 site 目录。返回 {科目: 文本}"""
    out = {}
    for subj in MINDMAP_SUBJECTS:
        p = HERE / "408" / subj / "思维导图大纲.md"
        if p.exists():
            out[subj] = p.read_text("utf-8", errors="ignore")
            continue
        legacy = HERE.parent / "site" / "408" / subj / "思维导图大纲.md"
        if legacy.exists():
            out[subj] = legacy.read_text("utf-8", errors="ignore")
    return out


def restore_mindmaps(stash):
    for subj, text in stash.items():
        text = re.sub(r"\.html\)", ".md)", text)   # 幂等：已改写过则无操作
        dst = HERE / "408" / subj / "思维导图大纲.md"
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(text, "utf-8")
    print(f"  思维导图大纲 {len(stash)} 份（wipe 前暂存恢复）")
    return [f"408/{s}/思维导图大纲.md" for s in stash]


def strip_md(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)                 # html 标签
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
        if subj not in INCLUDE:
            continue
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


def main():
    if not SRC.exists():
        print(f"源目录不存在: {SRC}")
        sys.exit(1)
    mds = collect_mds()
    print(f"共收录 {len(mds)} 个 md 文件")
    mm_stash = stash_mindmaps()          # 必须 wipe 前暂存（大纲源即仓库自身）
    # 清空旧内容（保留代码/配置）
    for sub in INCLUDE:
        tgt = HERE / sub
        if tgt.exists():
            shutil.rmtree(tgt)
    for src, rel in mds:
        copy_md(src, rel)
    mm_rels = restore_mindmaps(mm_stash)
    pages = [(rel, Path(rel).stem) for _, rel in mds] + \
            [(rel, Path(rel).stem) for rel in mm_rels]
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
