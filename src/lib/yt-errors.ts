/**
 * Human-friendly reason for a YouTube IFrame Player error code.
 * Reference: https://developers.google.com/youtube/iframe_api_reference#onError
 */
export function ytErrorReason(code: number): string {
  switch (code) {
    case 2:
      return "bad parameter";
    case 5:
      return "player error";
    case 100:
      return "video unavailable";
    case 101:
    case 150:
      return "embed disabled";
    default:
      return `error ${code}`;
  }
}
