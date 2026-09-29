import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Screening } from "./domain.js";

const template = readFileSync(new URL("../assets/social-card.svg", import.meta.url), "utf8");
const venues = [
  { id: "trylon", name: "Trylon", color: "#215a44", tint: "#e4e9e2", width: 160 },
  { id: "heights", name: "Heights", color: "#704470", tint: "#ece7e7", width: 180 },
  { id: "parkway", name: "Parkway", color: "#91451f", tint: "#f0e7df", width: 200 },
  { id: "riverview", name: "Riverview", color: "#285f8f", tint: "#e5eaea", width: 220 },
  { id: "main", name: "Main", color: "#515d6b", tint: "#e9e9e6", width: 168 },
] as const;
const format = (date: string, year: boolean) => new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC", weekday: "long", month: "long", day: "numeric", ...(year ? { year: "numeric" } as const : {}),
}).format(new Date(`${date}T12:00:00Z`));

export function socialCard(date: string, day: readonly Screening[]) {
  const listed = day.filter(show => show.status.kind !== "cancelled");
  const active = venues.filter(venue => listed.some(show => show.venueId === venue.id));
  const summary = `${listed.length} screening${listed.length === 1 ? "" : "s"} · ${active.length} theater${active.length === 1 ? "" : "s"}`;
  const names = new Intl.ListFormat("en-US").format(active.map(venue => venue.name));
  const description = `${listed.length ? `${listed.length} screening${listed.length === 1 ? "" : "s"} at ${names}` : "No screenings listed"}. See films on ${format(date, true)}. All times Central.`;
  let x = 72;
  const badges = active.map(venue => {
    const badge = `<rect x="${x}" y="352" width="${venue.width}" height="64" rx="8" fill="${venue.tint}"/><text x="${x + venue.width / 2}" y="394" fill="${venue.color}">${venue.name}</text>`;
    x += venue.width + 32;
    return badge;
  }).join("");
  const svg = template.replace("{{date}}", format(date, false)).replace("{{summary}}", summary)
    .replace("{{theaters}}", `<g font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" text-anchor="middle">${badges}</g>`);
  const hash = createHash("sha256").update(svg).digest("hex").slice(0, 12);
  return { svg, description, alt: `Twin Cities Movie Club. ${description}`,
    imagePath: `/social/${date}-${hash}.png` };
}
