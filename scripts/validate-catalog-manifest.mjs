// Audit a freshly generated public/catalog.json against catalog-manifest.json.
// Fails on suspicious swings (station disappearing/emptying, per-station or total
// count dropping beyond threshold, or silent video swap with stable counts) so a
// yt-dlp API change can't silently gut stations.
//
// Two layers of audit:
//   1. Count audit — per-station and total video counts vs baseline (hard fail).
//   2. Video audit — per-video ID/title/duration diff vs baseline. Catches silent
//      swaps where counts stay stable but the actual videos change en masse
//      (churn > maxVideoChurnPct of baseline). The diff summary is written for
//      inclusion in commit messages and the GitHub job summary.
//
// Usage:
//   node scripts/validate-catalog-manifest.mjs [--update] [--diff-file <path>]
//
//   --update           after a passing audit, rewrite manifest baselines to current catalog
//   --diff-file <path> write the compact per-station + video diff (for commit messages) to <path>
//
// Override (intentional big change, e.g. station removed from stations.json):
//   CATALOG_AUDIT_OVERRIDE=1 node scripts/validate-catalog-manifest.mjs --update
// Violations are reported as warnings and the manifest is rebaselined.
// See docs/catalog-auditability.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_THRESHOLDS = {
  // Max acceptable per-station drop, as % of the manifest baseline.
  maxStationDropPct: 30,
  // Small stations get at least this much absolute slack before the % rule bites.
  minStationDropAbs: 5,
  // Max acceptable drop in total catalog size, as % of the manifest baseline.
  maxTotalDropPct: 20,
  // Max acceptable per-station replacement churn as % of the manifest baseline.
  // Replacement churn is twice the smaller of added/removed IDs, so healthy
  // catalog growth does not look like a silent same-cardinality swap.
  maxVideoChurnPct: 50,
};

export function stationCounts(catalog) {
  return Object.fromEntries(
    Object.entries(catalog.stations || {}).map(([id, st]) => [id, (st.videos || []).length])
  );
}

/**
 * Extract per-station video manifests from a catalog.
 * Returns { stationId: { videoId: { t: title, d: duration } } }.
 * Compact keys (t/d) keep the committed manifest file small.
 */
export function stationVideos(catalog) {
  const out = {};
  for (const [id, st] of Object.entries(catalog.stations || {})) {
    const vids = {};
    for (const v of st.videos || []) {
      vids[v.id] = { t: v.title ?? '', d: v.duration ?? 0 };
    }
    out[id] = vids;
  }
  return out;
}

/**
 * Pure diff of one station's videos vs its baseline.
 * `expected` and `actual` are { videoId: { t, d } } maps.
 * Returns { added: [id], removed: [id], titleChanged: [{id, from, to}],
 *           removedTitles: { id: title } } — removedTitles carries the baseline
 *           titles of removed videos so the audit log shows what was gutted.
 */
export function diffStationVideos(expected, actual) {
  const exp = expected || {};
  const act = actual || {};
  const added = [];
  const removed = [];
  const titleChanged = [];
  const removedTitles = {};
  for (const id of Object.keys(act)) {
    if (!(id in exp)) added.push(id);
    else if ((act[id].t ?? '') !== (exp[id].t ?? ''))
      titleChanged.push({ id, from: exp[id].t, to: act[id].t });
  }
  for (const id of Object.keys(exp)) {
    if (!(id in act)) {
      removed.push(id);
      removedTitles[id] = exp[id].t ?? '';
    }
  }
  added.sort();
  removed.sort();
  titleChanged.sort((a, b) => a.id.localeCompare(b.id));
  return { added, removed, titleChanged, removedTitles };
}

/**
 * Pure comparison: current per-station counts (and optional video manifests)
 * vs manifest baselines. When `currentVideos` and `manifest.videos` are both
 * present, a per-station video diff is computed and a churn violation is raised
 * if added+removed IDs exceed maxVideoChurnPct of the baseline (catches silent
 * swaps with stable counts).
 */
export function compareToManifest(counts, manifest, currentVideos) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(manifest.thresholds || {}) };
  const expected = manifest.stations || {};
  const expectedVideos = manifest.videos || {};
  const violations = [];
  const warnings = [];
  const rows = [];
  const videoDiffs = {};

  for (const [id, exp] of Object.entries(expected)) {
    const actual = counts[id] ?? 0;
    const delta = actual - exp;
    rows.push({ id, expected: exp, actual, delta });
    if (!(id in counts)) {
      violations.push(`station "${id}" disappeared from the catalog (baseline ${exp} videos)`);
      continue;
    }
    if (actual === 0) {
      violations.push(`station "${id}" is empty (baseline ${exp} videos)`);
      continue;
    }
    const allowedDrop = Math.max(
      Math.round((exp * thresholds.maxStationDropPct) / 100),
      thresholds.minStationDropAbs
    );
    if (delta < -allowedDrop) {
      violations.push(
        `station "${id}" dropped ${-delta} videos (${exp} → ${actual}; allowed drop ${allowedDrop})`
      );
    }

    // Video-level diff — catches silent swaps where counts stay stable.
    if (currentVideos && expectedVideos[id]) {
      const diff = diffStationVideos(expectedVideos[id], currentVideos[id] || {});
      videoDiffs[id] = diff;
      const churn = 2 * Math.min(diff.added.length, diff.removed.length);
      if (churn > 0 && exp > 0) {
        const churnPct = Math.round((churn / exp) * 100);
        if (churnPct > thresholds.maxVideoChurnPct) {
          violations.push(
            `station "${id}" churned ${churn} videos (${churnPct}% of ${exp} baseline; +${diff.added.length} added, -${diff.removed.length} removed; threshold ${thresholds.maxVideoChurnPct}%) — counts stable but video set changed`
          );
        }
      }
    }
  }

  for (const [id, actual] of Object.entries(counts)) {
    if (!(id in expected)) {
      rows.push({ id, expected: 0, actual, delta: actual });
      warnings.push(
        `new station "${id}" (${actual} videos) not in manifest — rebaseline with --update`
      );
    }
  }

  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const expectedTotal = manifest.totalVideos ?? Object.values(expected).reduce((s, n) => s + n, 0);
  const totalAllowedDrop = Math.round((expectedTotal * thresholds.maxTotalDropPct) / 100);
  if (expectedTotal - total > totalAllowedDrop) {
    violations.push(
      `total catalog dropped ${expectedTotal - total} videos (${expectedTotal} → ${total}; allowed drop ${totalAllowedDrop})`
    );
  }

  rows.sort((a, b) => a.id.localeCompare(b.id));
  return { rows, violations, warnings, total, expectedTotal, thresholds, videoDiffs };
}

const fmtDelta = (d) => (d > 0 ? `+${d}` : `${d}`);

/** Compact per-station diff for commit messages. Unchanged stations are collapsed. */
export function formatDiffLines(result) {
  const changed = result.rows.filter((r) => r.delta !== 0);
  const lines = [
    `Stations: ${result.rows.length}, total videos: ${result.expectedTotal} → ${result.total} (${fmtDelta(result.total - result.expectedTotal)})`,
  ];
  if (changed.length === 0) {
    lines.push('No per-station count changes.');
  } else {
    for (const r of changed) {
      lines.push(`  ${r.id}: ${r.expected} → ${r.actual} (${fmtDelta(r.delta)})`);
    }
  }

  // Video-level changelog — concise per-station added/removed/title-changed summary.
  const videoLines = formatVideoDiffLines(result);
  if (videoLines) lines.push('', videoLines);
  return lines.join('\n');
}

/**
 * Concise video-level changelog for commit messages.
 * Only stations with changes are listed; unchanged stations are collapsed.
 * Removed titles are the most audit-relevant — list up to 5 per station.
 */
export function formatVideoDiffLines(result) {
  const diffs = result.videoDiffs || {};
  const stations = Object.keys(diffs).sort();
  const changed = stations.filter((id) => {
    const d = diffs[id];
    return d.added.length > 0 || d.removed.length > 0 || d.titleChanged.length > 0;
  });
  if (changed.length === 0) return '';

  let totAdded = 0,
    totRemoved = 0,
    totTitles = 0;
  for (const id of changed) {
    totAdded += diffs[id].added.length;
    totRemoved += diffs[id].removed.length;
    totTitles += diffs[id].titleChanged.length;
  }

  const lines = [
    `Video changes: +${totAdded} added, -${totRemoved} removed, ~${totTitles} title changed across ${changed.length} station(s)`,
  ];
  for (const id of changed) {
    const d = diffs[id];
    const parts = [];
    if (d.added.length) parts.push(`+${d.added.length}`);
    if (d.removed.length) parts.push(`-${d.removed.length}`);
    if (d.titleChanged.length) parts.push(`~${d.titleChanged.length}`);
    lines.push(`  ${id}: ${parts.join(' ')}`);
    // Removed titles are the most important for auditability — show up to 5.
    if (d.removed.length > 0) {
      const sample = d.removed.slice(0, 5);
      for (const vid of sample) {
        const title = d.removedTitles?.[vid] ?? '';
        lines.push(`    - removed ${vid}${title ? ` "${title}"` : ''}`);
      }
      if (d.removed.length > 5) lines.push(`    - ...and ${d.removed.length - 5} more removed`);
    }
  }
  return lines.join('\n');
}

/** Markdown table for the GitHub Actions job summary. */
export function formatMarkdownSummary(result, { overridden = false } = {}) {
  const lines = [
    '## Catalog audit',
    '',
    `Total videos: **${result.expectedTotal} → ${result.total}** (${fmtDelta(result.total - result.expectedTotal)})`,
    '',
    '| Station | Baseline | New | Δ |',
    '| --- | ---: | ---: | ---: |',
  ];
  for (const r of result.rows) {
    lines.push(`| ${r.id} | ${r.expected} | ${r.actual} | ${fmtDelta(r.delta)} |`);
  }

  // Video-level diff table.
  const diffs = result.videoDiffs || {};
  const vStations = Object.keys(diffs).sort();
  const vChanged = vStations.filter((id) => {
    const d = diffs[id];
    return d.added.length > 0 || d.removed.length > 0 || d.titleChanged.length > 0;
  });
  if (vChanged.length > 0) {
    lines.push('', '### Video-level changes', '');
    lines.push('| Station | Added | Removed | Title changed |');
    lines.push('| --- | ---: | ---: | ---: |');
    for (const id of vChanged) {
      const d = diffs[id];
      lines.push(
        `| ${id} | +${d.added.length} | -${d.removed.length} | ~${d.titleChanged.length} |`
      );
    }
    // List removed titles (up to 10 per station) — the most audit-relevant signal.
    for (const id of vChanged) {
      const d = diffs[id];
      if (d.removed.length > 0) {
        const sample = d.removed.slice(0, 10);
        lines.push(
          '',
          `<details><summary><b>${id}</b> — ${d.removed.length} removed video(s)</summary>`,
          ''
        );
        for (const vid of sample) {
          const title = d.removedTitles[vid] ?? '';
          lines.push(`- \`${vid}\` — ${title}`);
        }
        if (d.removed.length > 10) lines.push(`- _...and ${d.removed.length - 10} more_`);
        lines.push('', '</details>');
      }
    }
  }

  if (result.violations.length > 0) {
    lines.push('', overridden ? '### Violations (overridden)' : '### Violations');
    for (const v of result.violations) lines.push(`- ${v}`);
  }
  if (result.warnings.length > 0) {
    lines.push('', '### Warnings');
    for (const w of result.warnings) lines.push(`- ${w}`);
  }
  return `${lines.join('\n')}\n`;
}

export function buildManifest(counts, thresholds, videos) {
  const sortedStations = Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  );
  const manifest = {
    $comment:
      'Catalog audit baselines. Auto-rebaselined by CI after each passing audit (validate-catalog-manifest.mjs --update). See docs/catalog-auditability.md for thresholds and overrides.',
    generatedAt: new Date().toISOString(),
    thresholds,
    totalVideos: Object.values(counts).reduce((s, n) => s + n, 0),
    stations: sortedStations,
  };
  if (videos) {
    manifest.videos = Object.fromEntries(
      Object.entries(videos)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, vids]) => [
          id,
          Object.fromEntries(Object.entries(vids).sort(([a], [b]) => a.localeCompare(b))),
        ])
    );
  }
  return manifest;
}

function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const root = path.join(__dirname, '..');
  const catalogPath = path.join(root, 'public', 'catalog.json');
  const manifestPath = path.join(root, 'catalog-manifest.json');

  const args = process.argv.slice(2);
  const update = args.includes('--update');
  const diffFileIdx = args.indexOf('--diff-file');
  const diffFile = diffFileIdx !== -1 ? args[diffFileIdx + 1] : null;
  const override = process.env.CATALOG_AUDIT_OVERRIDE === '1';

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
  const counts = stationCounts(catalog);
  const videos = stationVideos(catalog);

  if (!fs.existsSync(manifestPath)) {
    if (!update) {
      console.error(`No ${path.basename(manifestPath)} found. Bootstrap one with --update.`);
      process.exit(1);
    }
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(buildManifest(counts, DEFAULT_THRESHOLDS, videos), null, 2)}\n`
    );
    console.log(`Bootstrapped ${manifestPath} from current catalog.`);
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const result = compareToManifest(counts, manifest, videos);

  console.log(formatDiffLines(result));
  for (const w of result.warnings) console.warn(`WARN: ${w}`);
  for (const v of result.violations) console.error(`VIOLATION: ${v}`);

  if (diffFile) fs.writeFileSync(diffFile, `${formatDiffLines(result)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      formatMarkdownSummary(result, { overridden: override })
    );
  }

  const failed = result.violations.length > 0;
  if (failed && !override) {
    console.error(
      '\nCatalog audit failed. If this swing is intentional, re-run with CATALOG_AUDIT_OVERRIDE=1 (or the override_audit workflow input). See docs/catalog-auditability.md.'
    );
    process.exit(1);
  }
  if (failed && override) {
    console.warn('\nCatalog audit violations overridden via CATALOG_AUDIT_OVERRIDE=1.');
  }

  if (update) {
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(buildManifest(counts, result.thresholds, videos), null, 2)}\n`
    );
    console.log(`Rebaselined ${manifestPath}.`);
  }
  console.log('Catalog audit passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
