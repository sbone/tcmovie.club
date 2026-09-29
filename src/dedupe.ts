import type { Screening } from "./domain.js";

export function dedupe(screenings: readonly Screening[]): Screening[] {
  const result = new Map<string, Screening>();
  for (const item of screenings) {
    // ponytail: remove only explicit format suffixes; use reviewed aliases for other title differences.
    const title = item.title.normalize("NFC").trim().toLowerCase().replace(/\s+in\s+(?:35mm|70mm|4k|dcp)$/, "");
    const key = JSON.stringify([item.venueId, item.start.at, title]);
    const existing = result.get(key);
    if (!existing) result.set(key, item);
    else if (existing.sourceId !== item.sourceId) {
      const primary = item.sourceId === item.venueId ? item : existing;
      result.set(key, { ...primary,
        format: primary.format ?? existing.format ?? item.format,
        access: existing.access === "members-only" || item.access === "members-only" ? "members-only" : primary.access });
    } else if (existing.id !== item.id) {
      result.set(`${key}:${item.id}`, item);
    }
  }
  return [...result.values()].sort((a, b) => a.start.at.localeCompare(b.start.at) || a.id.localeCompare(b.id));
}
