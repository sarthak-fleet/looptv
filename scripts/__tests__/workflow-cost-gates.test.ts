import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowsDir = resolve(__dirname, '../../.github/workflows');
const fetchWorkflow = readFileSync(resolve(workflowsDir, 'fetch-catalog-sources.yml'), 'utf8');
const buildWorkflow = readFileSync(resolve(workflowsDir, 'build-catalog.yml'), 'utf8');
const fetchScript = readFileSync(resolve(__dirname, '../fetch-sources.sh'), 'utf8');

describe('catalog workflow cost gates', () => {
  it('runs discovery only twice monthly with bounded cache/API settings', () => {
    expect(fetchWorkflow).toContain('cron: "0 6 1,15 * *"');
    expect(fetchWorkflow).toContain('CACHE_MAX_AGE_DAYS: "13"');
    expect(fetchWorkflow).toContain('YOUTUBE_RECENT_VIDEO_LIMIT: "250"');
    expect(fetchWorkflow).toContain('YOUTUBE_MAX_REQUESTS_PER_SOURCE: "20"');
  });

  it('injects the YouTube credential only into the source-fetch workflow', () => {
    const consumers = readdirSync(workflowsDir)
      .filter((name) => name.endsWith('.yml'))
      .filter((name) =>
        readFileSync(resolve(workflowsDir, name), 'utf8').includes('secrets.YOUTUBE_API_KEY')
      );
    expect(consumers).toEqual(['fetch-catalog-sources.yml']);
    expect(fetchWorkflow).toContain('YOUTUBE_API_KEY: $' + '{{ secrets.YOUTUBE_API_KEY }}');
    expect(fetchWorkflow).toContain("if: github.ref == 'refs/heads/main'");
  });

  it('calls free AI only when untagged videos exist', () => {
    expect(buildWorkflow).toMatch(
      /name: Smoke test AI gateway[\s\S]*?if: steps\.pending-tags-before\.outputs\.count != '0'/
    );
    expect(buildWorkflow).toMatch(
      /name: Tag new videos via AI gateway[\s\S]*?steps\.pending-tags-before\.outputs\.count != '0'/
    );
  });

  it('chains only a successful source workflow and reports request metrics', () => {
    expect(buildWorkflow).toContain('workflows: [Fetch Catalog Sources]');
    expect(buildWorkflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(buildWorkflow).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(buildWorkflow).toContain("github.ref == 'refs/heads/main'");
    expect(fetchScript.indexOf(': > "$FETCH_METRICS_FILE"')).toBeLessThan(
      fetchScript.indexOf('xargs -P "$FETCH_CONCURRENCY"')
    );
    expect(fetchScript).toContain('node scripts/summarize-fetch-metrics.mjs "$FETCH_METRICS_FILE"');
  });
});
