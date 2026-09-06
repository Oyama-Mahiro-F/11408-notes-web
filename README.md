# 11408 考研笔记

在线地址：https://oyama-mahiro-f.github.io/11408-notes-web/

本仓库已从「Typora 导出 HTML」整体替换为 **Markdown 直渲染**：客户端 marked + KaTeX + highlight.js + markmap，
`sync.py` 直接同步 `../考研` 源 md，无需 Typora 导出。矩阵 / 三重积分 / cases 等复杂公式已逐页验证。

## 使用

```bash
python sync.py                  # 从 ../考研 同步 md + .assets，重建目录树与搜索索引
python -m http.server 8737     # 本地预览 → http://127.0.0.1:8737/
python push.py                  # 同步 + git commit + push（GitHub Pages 自动部署）
```

或双击 `start.bat`（起服务器 + 开浏览器）、`push.bat`（一键部署）。

## 结构

```
index.html        SPA 外壳（顶栏 / 左树 / 正文 / 右 TOC）
css/ js/          样式与逻辑（marked 渲染管线、搜索、目录树、TOC、灯箱）
vendor/           KaTeX 0.16 + marked 12 + highlight.js 11 + markmap（本地化，离线可用）
manifest.json     目录树（sync.py 生成）
search/           分科搜索索引（sync.py 生成，懒加载）
408/ 数学/ 英语/   同步来的笔记（*.md + *.assets + 思维导图大纲）
sync.py push.py   同步 / 一键部署
.github/workflows 部署白名单（push 到 main 触发）
```

## 公式渲染要点（防矩阵/三重积分翻车）

渲染顺序是关键（见 `js/app.js` 的 `stashMath`）：

1. **先**摘走围栏代码块与行内代码 → 占位符
2. **再**摘走 `$$...$$` 与 `$...$` 公式 → 占位符
3. 然后才交给 marked 解析 markdown
4. 最后还原占位符，逐个交给 `katex.render`（`throwOnError:false, strict:'ignore'`）

这样矩阵里的 `\\`、`_`、`&`，表格里的 `|`，都不会被 markdown 解析器破坏。
图片路径带空格/中文，渲染前对每段做 `encodeURIComponent` 预编码。

## 更新笔记后

1. 改 `../考研/` 下的 md
2. `python push.py`（或先 `sync.py` 本地看一眼再 `push.py`）

## 功能清单

- 三栏布局：顶栏标签 / 左侧目录树（可收起成细条、自动展开定位）/ 右侧页内 TOC（可收起；层级树默认只到节标题，点箭头展开、滚动时自动展开到当前阅读位置）
- **思维导图**：`思维导图大纲.md` 用 markmap 渲染（缩放/平移/折叠，公式也支持）；大纲文件为仓库内源文件，`sync.py` 同步时自动保留
- **搜索**：中文 bigram + 整词加权，下拉卡片（标题 + 面包屑路径 + 高亮摘要），Ctrl+K 聚焦
- **图片灯箱**：点击正文图片全屏查看，Esc/点击关闭
- **站内链接**：正文里的 `[x](xxx.md)` 链接自动走 hash 路由，不跳出 SPA
