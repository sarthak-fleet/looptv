import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function summarizeFetchMetrics(rows) {
  const modes = {};
  let apiRequests = 0;
  let videos = 0;
  for (const row of rows) {
    modes[row.mode || 'unknown'] = (modes[row.mode || 'unknown'] || 0) + 1;
    apiRequests += Number(row.apiRequests || 0);
    videos += Number(row.count || 0);
  }
  return { sources: rows.length, videos, apiRequests, modes };
}

export function readFetchMetricRows(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = summarizeFetchMetrics(readFetchMetricRows(process.argv[2]));
  const modeText = Object.entries(summary.modes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mode, count]) => `${mode}=${count}`)
    .join(', ');
  const markdown = [
    '### Catalog source fetch',
    `- Sources processed: ${summary.sources}`,
    `- Source rows available: ${summary.videos}`,
    `- YouTube Data API requests: ${summary.apiRequests}`,
    `- Modes: ${modeText || 'none'}`,
    '',
  ].join('\n');
  process.stdout.write(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  }
}
