import type { Screening } from "./domain.js";

export function dedupe(screenings: readonly Screening[]): Screening[] {
  const result = new Map<string, Screening>();
  for (const item of screenings) {
    // ponytail: exact titles only; add reviewed source aliases if actual overlaps need them.
    const key = JSON.stringify([item.venueId, item.start.at, item.title.normalize("NFC").trim().toLowerCase()]);
    const existing = result.get(key);
    if (!existing) result.set(key, item);
    else if (existing.sourceId !== item.sourceId) {
      const primary = item.sourceId === item.venueId ? item : existing;
      result.set(key, { ...primary,
        access: existing.access === "members-only" || item.access === "members-only" ? "members-only" : primary.access });
    } else if (existing.id !== item.id) {
      result.set(`${key}:${item.id}`, item);
    }
  }
  return [...result.values()].sort((a, b) => a.start.at.localeCompare(b.start.at) || a.id.localeCompare(b.id));
}
