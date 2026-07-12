import { describe, expect, it } from 'vitest';
import { normalizeBatchTags } from '../tag-result.mjs';

describe('normalizeBatchTags', () => {
  const videos = [{ id: 'one', source: 'Channel A' }];

  it('normalizes valid tags and includes the source', () => {
    expect(normalizeBatchTags(videos, [[' science ', 'space']])).toEqual([
      ['Channel A', 'science', 'space'],
    ]);
  });

  it('rejects empty topical tags instead of counting them as success', () => {
    expect(() => normalizeBatchTags(videos, [[]])).toThrow('contain no topic');
    expect(() => normalizeBatchTags(videos, [['Channel A']])).toThrow('contain no topic');
  });

  it('rejects malformed batch shapes', () => {
    expect(() => normalizeBatchTags(videos, [])).toThrow('Expected 1 tag arrays');
    expect(() => normalizeBatchTags(videos, ['science'])).toThrow('not an array');
  });
});
