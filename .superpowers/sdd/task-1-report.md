# Task 1 Report: `build_search_index()` in `add_nav.py`

## What Was Implemented

- Added `import json` and `from html.parser import HTMLParser` at the top of `add_nav.py`
- Added `_TextExtractor` class (HTMLParser subclass) to extract visible text while skipping `<script>`, `<style>`, `<noscript>` tags
- Added `bigram_tokenize(text)` — tokenizes Chinese text into sliding bigrams and ASCII words into whole lowercase tokens
- Added `build_search_index(site_dir)` function that:
  - Walks all `.html` files under `site_dir`
  - Groups by subject (408, 数学, 英语, 政治)
  - Extracts title, body text (first 500 chars for snippet), and file path
  - Builds per-subject inverted index: bigram/term -> list of page IDs
  - Writes JSON files to `site/search/{subject}.json` with `pages` and `index` keys
- Called `build_search_index(site_dir)` in the main flow before `gen_main_index()`

## Test Results

```
python add_nav.py output (search-related lines):
  Building search index...
  [search] skipped 1 files outside subject dirs
  [search] 408: 22 pages, 140 unique terms -> 408.json
  [search] 数学: 35 pages, 147 unique terms -> 数学.json
  [search] 英语: 6 pages, 151 unique terms -> 英语.json
  [search] done — 3 indices written
```

Verification commands confirmed:
- `search/408.json`: valid JSON, 22 pages, 140 terms, keys: `pages`, `index`
- `search/数学.json`: valid JSON, 35 pages, 147 terms
- `search/英语.json`: valid JSON, 6 pages, 151 terms
- All files are UTF-8 encoded with literal Chinese characters (no Unicode escapes)
- 政治 has no content files, so no index was generated (expected)

## Files Changed

- `D:\university_learning\site\add_nav.py` — added ~140 lines (imports, 3 new functions/classes, 1 call site)
- `D:\university_learning\site\search\408.json` — new file
- `D:\university_learning\site\search\数学.json` — new file
- `D:\university_learning\site\search\英语.json` — new file

## Self-Review Findings

1. **Chinese character range**: Used `[一-鿿]` (U+4E00-U+9FFF) in regex instead of `[\u4e00-\u9fff]` — functionally identical.
2. **No `.gitkeep` needed**: The `search/` directory is not gitignored (the repo root IS the `site/` directory, so `.gitignore`'s `site/` pattern doesn't match).
3. **3 indices vs 4 subjects**: 政治 directory doesn't exist, so no index was generated. This is correct behavior.
4. **Bigram coverage**: Single Chinese characters are not indexed (only bigrams plus ASCII words). This is by design for search quality.
5. **Encoding**: JSON files use `ensure_ascii=False` and UTF-8 encoding — correct for Chinese content.

## Issues or Concerns

- None. The function generates correct output on the first run.

---

## Fix Round 1: C1 + I1 (2026-07-23)

### Critical Issue C1 — Search index contained nav boilerplate

**Root cause:** `build_search_index()` was called AFTER `add_nav()` had already injected navigation shells into all HTML files. Every page's first ~500 characters was the identical nav sidebar, making the text-based search index useless (all terms matched all pages).

**Fixes applied:**

1. **Moved `build_search_index(site_dir)` to run BEFORE the `add_nav()` processing loop** (i.e., before files are modified). This ensures it reads the original content rather than nav-injected HTML.

2. **Added `<main class="nav-content">` extraction in `build_search_index()`**: Since files may already have nav shells from a prior run, the function now checks for `<main class="nav-content">` (the container that holds the original body content inside the nav shell). If found, it extracts text from there; otherwise falls back to the raw `<body>`.

3. **Added content preservation in `add_nav()`**: When processing a file that already has a nav shell, `add_nav()` now saves the content from `<main class="nav-content">` BEFORE stripping the shell markers. Previously, stripping `<!-- NAV_SHELL_START -->...<!-- NAV_SHELL_END -->` would also remove the embedded original content, causing content loss on subsequent runs.

### Important Issue I1 — JSON minified, diffs enormous

**Fix:** Added `indent=2` to the `json.dump()` call in `build_search_index()`.

### Files Changed

- `D:\university_learning\site\add_nav.py` — 3 changes:
  - Moved `build_search_index()` call before the file processing loop
  - Added `<main class="nav-content">` extraction to `build_search_index()` for nav-shell resilience
  - Added content preservation in `add_nav()` to prevent content loss on re-processing
  - Added `indent=2` to `json.dump()`
- `D:\university_learning\site\search\408.json` — regenerated with proper content and indentation
- `D:\university_learning\site\search\数学.json` — regenerated with proper content and indentation
- `D:\university_learning\site\search\英语.json` — regenerated with proper content and indentation

### Test Results

```text
Building search index...
  [search] skipped 2 files outside subject dirs
  [search] 408: 22 pages, 1932 unique terms -> 408.json
  [search] 数学: 35 pages, 2433 unique terms -> 数学.json
  [search] 英语: 6 pages, 578 unique terms -> 英语.json
  [search] done — 3 indices written
```

Uniqueness verification:
```
408: 22 pages, 22 unique texts (100% unique)
数学: 35 pages, 35 unique texts (100% unique)
英语: 6 pages, 6 unique texts (100% unique)
```

JSON indentation verified — each page entry is properly pretty-printed with 2-space indent.
