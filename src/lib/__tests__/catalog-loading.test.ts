import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('catalog asset loading', () => {
  it('revalidates the full catalog on a normal load', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        generatedAt: '2026-07-12T00:00:00.000Z',
        lastUpdated: '2026-07-12T00:00:00.000Z',
        stations: { snl: { videos: [{ id: 'one' }], categoryVideoIds: {} } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { loadCatalog } = await import('../catalog');
    await loadCatalog();

    expect(fetchMock).toHaveBeenCalledWith('/catalog.json', { cache: 'no-cache' });
  });

  it('revalidates the summary on a normal load', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        generatedAt: '2026-07-12T00:00:00.000Z',
        lastUpdated: '2026-07-12T00:00:00.000Z',
        totalVideos: 1,
        stations: { snl: { videoCount: 1 } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { loadCatalogSummary } = await import('../catalog');
    await loadCatalogSummary();

    expect(fetchMock).toHaveBeenCalledWith('/catalog-summary.json', { cache: 'no-cache' });
  });
});
