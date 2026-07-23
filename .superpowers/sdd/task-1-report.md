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
