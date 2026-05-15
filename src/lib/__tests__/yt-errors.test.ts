import { describe, expect, it } from "vitest";

import { ytErrorReason } from "../yt-errors";

describe("ytErrorReason", () => {
  it("maps 101 and 150 to embed disabled", () => {
    expect(ytErrorReason(101)).toBe("embed disabled");
    expect(ytErrorReason(150)).toBe("embed disabled");
  });

  it("maps 100 to video unavailable", () => {
    expect(ytErrorReason(100)).toBe("video unavailable");
  });

  it("maps 5 to player error", () => {
    expect(ytErrorReason(5)).toBe("player error");
  });

  it("maps 2 to bad parameter", () => {
    expect(ytErrorReason(2)).toBe("bad parameter");
  });

  it("falls back to numeric code for unknown errors", () => {
    expect(ytErrorReason(999)).toBe("error 999");
  });
});
