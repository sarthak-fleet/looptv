// Audit a freshly generated public/catalog.json against catalog-manifest.json.
// Fails on suspicious swings (station disappearing/emptying, per-station or total
// count dropping beyond threshold) so a yt-dlp API change can't silently gut stations.
//
// Usage:
//   node scripts/validate-catalog-manifest.mjs [--update] [--diff-file <path>]
//
//   --update           after a passing audit, rewrite manifest baselines to current counts
//   --diff-file <path> write the compact per-station diff (for commit messages) to <path>
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
};

export function stationCounts(catalog) {
  return Object.fromEntries(
    Object.entries(catalog.stations || {}).map(([id, st]) => [id, (st.videos || []).length])
  );
}

/** Pure comparison: current per-station counts vs manifest baselines. */
export function compareToManifest(counts, manifest) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(manifest.thresholds || {}) };
  const expected = manifest.stations || {};
  const violations = [];
  const warnings = [];
  const rows = [];

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
  return { rows, violations, warnings, total, expectedTotal, thresholds };
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

export function buildManifest(counts, thresholds) {
  return {
    $comment:
      'Catalog audit baselines. Auto-rebaselined by CI after each passing audit (validate-catalog-manifest.mjs --update). See docs/catalog-auditability.md for thresholds and overrides.',
    generatedAt: new Date().toISOString(),
    thresholds,
    totalVideos: Object.values(counts).reduce((s, n) => s + n, 0),
    stations: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
  };
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

  if (!fs.existsSync(manifestPath)) {
    if (!update) {
      console.error(`No ${path.basename(manifestPath)} found. Bootstrap one with --update.`);
      process.exit(1);
    }
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(buildManifest(counts, DEFAULT_THRESHOLDS), null, 2)}\n`
    );
    console.log(`Bootstrapped ${manifestPath} from current catalog.`);
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const result = compareToManifest(counts, manifest);

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
      `${JSON.stringify(buildManifest(counts, result.thresholds), null, 2)}\n`
    );
    console.log(`Rebaselined ${manifestPath}.`);
  }
  console.log('Catalog audit passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
