/** Normalize and validate one gateway batch before it is counted as tagged. */
export function normalizeBatchTags(videos, tags) {
  if (!Array.isArray(tags) || tags.length !== videos.length) {
    throw new Error(`Expected ${videos.length} tag arrays, got ${tags?.length ?? 'invalid'}`);
  }

  return tags.map((value, index) => {
    if (!Array.isArray(value)) throw new Error(`Tags for ${videos[index].id} are not an array`);
    const normalized = value
      .filter((tag) => typeof tag === 'string')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const combined = new Set([videos[index].source || '', ...normalized]);
    combined.delete('');
    if (combined.size <= 1) {
      throw new Error(`Tags for ${videos[index].id} contain no topic beyond its source`);
    }
    return [...combined].slice(0, 10);
  });
}
