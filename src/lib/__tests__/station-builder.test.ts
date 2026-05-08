import { describe, expect, it } from "vitest";
import {
  buildCatalogPreview,
  createStationDraft,
  createStationPrExport,
  normalizeYouTubeHandle,
  parseSourceLines,
  slugifyStationId,
} from "../station-builder";
import type { Catalog, StationConfig } from "../types";

describe("station builder", () => {
  it("normalizes station ids and YouTube handles", () => {
    expect(slugifyStationId("My New Station!")).toBe("my-new-station");
    expect(normalizeYouTubeHandle("https://www.youtube.com/@veritasium/videos")).toBe("@veritasium");
    expect(normalizeYouTubeHandle("kurzgesagt")).toBe("@kurzgesagt");
  });

  it("parses named source lines with default duration filters", () => {
    expect(parseSourceLines("Veritasium | @veritasium\nKurzgesagt | youtube.com/@kurzgesagt")).toEqual([
      { name: "Veritasium", handle: "@veritasium", minDuration: 60, maxDuration: 1800 },
      { name: "Kurzgesagt", handle: "@kurzgesagt", minDuration: 60, maxDuration: 1800 },
    ]);
  });

  it("creates a draft with a fallback description", () => {
    const draft = createStationDraft({
      name: "Deep Science",
      description: "",
      sourcesText: "Veritasium | @veritasium",
    });

    expect(draft).toMatchObject({
      id: "deep-science",
      name: "Deep Science",
      description: "Veritasium",
    });
  });

  it("previews committed catalog videos for matching station sources", () => {
    const catalog: Catalog = {
      lastUpdated: "2026-05-08",
      stations: {
        science: {
          videos: [
            { id: "a", title: "Science A", duration: 120, date: "", tags: [], source: "Veritasium" },
            { id: "b", title: "Science B", duration: 180, date: "", tags: [], source: "Kurzgesagt" },
          ],
          categoryVideoIds: {},
        },
      },
    };
    const stations: StationConfig[] = [
      {
        id: "science",
        name: "Science",
        description: "",
        sources: [{ name: "Veritasium", handle: "@veritasium" }],
      },
    ];
    const draft = createStationDraft({
      name: "Deep Science",
      description: "",
      sourcesText: "Veritasium | @veritasium\nNew Channel | @newchannel",
    });

    const preview = buildCatalogPreview(catalog, draft, stations);

    expect(preview.totalVideos).toBe(1);
    expect(preview.sourcePreviews[0].matchedStations).toEqual(["Science"]);
    expect(preview.sourcePreviews[0].sampleVideos[0].title).toBe("Science A");
    expect(preview.sourcePreviews[1].videoCount).toBe(0);
  });

  it("exports a PR-ready payload with catalog preview and JSON snippet", () => {
    const draft = createStationDraft({
      name: "Deep Science",
      description: "Physics and experiments",
      sourcesText: "Veritasium | @veritasium",
    });
    const text = createStationPrExport(draft, {
      totalVideos: 42,
      sourcePreviews: [{ source: draft.sources[0], videoCount: 42, sampleVideos: [], matchedStations: [] }],
    });

    expect(text).toContain("Title: Add Deep Science station");
    expect(text).toContain("42 matching videos");
    expect(text).toContain('"id": "deep-science"');
  });
});
