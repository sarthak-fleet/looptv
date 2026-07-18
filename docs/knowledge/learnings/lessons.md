---
title: Engineering Lessons
description: Concrete lessons evidenced in code or git history.
---

# Engineering Lessons — LoopTV

Concrete lessons evidenced in code or git history. See [architecture/decisions.md](../../architecture/decisions.md) for the "why" behind each choice.

---

## yt-dlp

### Sequential fetching avoids rate-limit bans
`fetch-all-sources.sh` and `build-catalog.sh` iterate channels in a `for` loop — one at a time, not parallel. Parallelizing yt-dlp across all configured sources (currently 122) in a single CI job risks YouTube rate-limiting the GitHub Actions IP range. The sequential approach is slower (~minutes) but reliable. (CI now shards the fetch across 8 parallel jobs — see [fetch-catalog-sources.md](../../operations/jobs/fetch-catalog-sources.md).)

### Cache wins when fresh fetch returns fewer rows
`build-catalog.sh` compares the freshly fetched line count against the cached JSONL. If the new fetch has fewer rows (region block, temporary network error, YouTube returning a short playlist), it silently keeps the cache. The threshold `MIN_CACHE_ROWS_TO_TRUST` (default 5) also triggers a re-fetch when a cached file looks suspiciously small.

```bash
if [ "$FRESH_COUNT" -gt "$COUNT" ]; then
  cp "$TEMP_DIR/${SAFE}.jsonl" "$CACHED"
else
  # keep old cache
  cp "$CACHED" "$TEMP_DIR/${SAFE}.jsonl"
fi
```

### `--flat-playlist` is the correct flag for metadata-only fetches
Using `yt-dlp` without `--flat-playlist` will attempt to resolve full video info (thumbnails, formats, subtitles). `--flat-playlist` returns lightweight JSON with only id, title, duration, view\_count, description — exactly what the catalog needs, and an order of magnitude faster.

---

## BERT NER (`dslim/bert-base-NER`)

### 512-token hard cap on input text
BERT models have a 512 subword-token limit. `extract-tags.py` slices the concatenated title+description to 512 characters (not tokens) as a cheap proxy:

```python
texts = [f"{v['title']}. {v.get('description', '')}".strip()[:512] for v in batch]
```

Character truncation is not the same as token truncation — a 512-character string can still produce >512 subword tokens for non-Latin text. The script accepts this imprecision; HuggingFace's tokenizer will silently truncate if over-limit.

### PER + LOC only; ORG and MISC produce noise
Initial runs tagged `ORG` entities (brand names, channel names, "Patreon", "Peacock") and `MISC` ("German", "SNL", "American") that were useless for browse. The script now filters to only `PER` (people) and `LOC` (places) with a 0.8 confidence threshold. Even so, NER-derived categories were found too noisy for production use and were removed after one day (commit `8203c0b`).

### NER is retained but superseded in CI
`extract-tags.py` and `requirements-ner.txt` are still in the repo. The `Build Catalog` workflow (`build-catalog.yml`, chained after the bi-weekly `Fetch Catalog Sources`) now calls `tag-videos.mjs` (LLM gateway) instead. `extract-tags.py` remains useful locally if the free-AI gateway is down, but installs `torch` (~1GB).

---

## YouTube IFrame Player API

### Embed errors 101 and 150 are silent and common
Error 101/150 fires when a channel owner has disabled embedding for a video (copyright claim, geo-restriction, owner setting). These cannot be predicted from the catalog — they are runtime-only. `Player.tsx` treats both as auto-skip with no visible error message to preserve the TV-channel feel. The `recordEmbedAttempt()` hook tracks these for source-health diagnostics.

### The `iframe_api` script can be blocked entirely
Ad-blockers and network filters sometimes block `https://www.youtube.com/iframe_api`. The script tag fires `onerror`, or more commonly the `onYouTubeIframeAPIReady` callback simply never fires. `Player.tsx` guards with a 12-second timeout (`API_LOAD_TIMEOUT_MS = 12000`); if it expires without the callback, `apiFailed` is set and a graceful fallback UI renders.

### Autoplay + muted is required for most browsers
Browsers block autoplay of unmuted media. `playerVars` sets `autoplay: 1` with the expectation that the IFrame API starts muted when autoplay is initiated programmatically. `playsinline: 1` is required for iOS to avoid fullscreen-only playback.

### `loadVideoById` is faster than destroying and re-creating the player
When the station or video changes, `Player.tsx` calls `playerRef.current.loadVideoById(videoId)` rather than destroying and re-mounting the component. This avoids re-injecting the `<script>` tag and re-initializing the YT API, which would cause a noticeable flash.

---

## Static Catalog

### `catalog.json` is ~2MB; summary file enables fast first paint
The full catalog is 2MB of JSON. A separate `catalog-summary.json` (video counts per station, no video records) is written by `process-catalog.mjs` and used for the initial station-grid render. The full catalog is loaded lazily when the user picks a station.

### Descriptions are stripped after NER/LLM tagging
Raw JSONL entries include `description` fields (up to 300 chars). Both `extract-tags.py` and `tag-videos.mjs` delete `description` from every video entry after tagging to keep `catalog.json` small:

```python
v.pop("description", None)  # extract-tags.py
delete video.description;   // tag-videos.mjs
```

### Empty-station guard prevents silent catalog corruption
`process-catalog.mjs` calls `process.exit(1)` if any station ends up with zero videos after processing, preventing a broken catalog from being committed:

```js
if (emptyStations.length > 0) {
  console.error(`Catalog build produced empty stations: ${emptyStations.join(", ")}. Refusing to ship.`);
  process.exit(1);
}
```

### NER tags are preserved across rebuilds by video ID
`process-catalog.mjs` loads the existing `catalog.json` before processing. Any video already present with `tags.length > 1` keeps its tags and skips NER/LLM re-tagging. This is the key mechanism that makes incremental weekly updates cheap — only new videos need tagging.

---

## Next.js 16 / Static Export

### Turbopack opted out for production builds
`pnpm build` uses `next build --webpack`. Turbopack is used in `pnpm dev` by default but not for production export. See [ADR-007](../../architecture/decisions.md#adr-007).

### React hydration mismatch from client-only localStorage reads
`TVApp.tsx` reads `localStorage` for watched state and preferences. On initial server render (or static export pre-render), `localStorage` is undefined, causing hydration mismatches. Fixed by gating all localStorage reads behind a `useEffect` or `typeof window !== 'undefined'` check (commit `Fix TVApp hydration mismatch`, 2026-05-26).

### `output: 'export'` drops server-side routes
Switching to static export removed the ability to use `ImageResponse` for OG images (requires a server runtime). The `opengraph-image.tsx` route was deleted; a static OG image in `public/` is used instead.

---

## LLM Tagging (`tag-videos.mjs`)

### Multi-model fan-out absorbs free-tier rate limits
The script fans out to 7 models simultaneously (Gemini Flash, Groq Llama 70B, SambaNova, NVIDIA, Cerebras, Workers AI, OpenRouter), each with 2 concurrent workers. Batches that fail (429 or parse error) are re-queued for another model. This makes the tagging resilient to any single provider's rate limit.

### JSON extraction requires a regex guard
LLM responses often include prose before or after the JSON array. The script extracts the array with:

```js
const match = content.match(/\[[\s\S]*\]/);
```

If the match fails or the array length doesn't match the input batch size, the batch is retried.

### 3.2-second inter-batch sleep is the rate-limit floor
Each worker sleeps 3,200ms between batches (`await sleep(3200)`). This is a pragmatic floor chosen to avoid 429s across all 7 models simultaneously. Actual sustainable throughput is ~14 workers × (1 batch / 3.2s) ≈ 65 videos/sec across all parallel workers.
