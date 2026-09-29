import { startLabel, timeZone } from "./domain.js";
import type { Screening, SourceId } from "./domain.js";
import { chicagoDate } from "./time.js";

export const venueNames = {
  trylon: "Trylon", heights: "Heights", parkway: "Parkway", riverview: "Riverview",
} as const;

export type SourceInfo = Readonly<{
  sourceId: SourceId;
  checkedAt: string | null;
  stale: boolean;
  note: string;
}>;

const escape = (text: string): string => text.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char] ?? char);
const clock = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
const stamp = new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" });

export function renderDate(date: string, screenings: readonly Screening[], sources: readonly SourceInfo[], dates: readonly string[] = [date]): string {
  const day = screenings.filter(item => chicagoDate(item.start.at) === date)
    .sort((a, b) => a.start.at.localeCompare(b.start.at) || a.title.localeCompare(b.title));
  const links = dates.map(value => `<a href="/${value}/"${value === date ? ' aria-current="date"' : ""}>${value}</a>`).join(" ");
  const rows = day.map(item => {
    const labels = [venueNames[item.venueId], item.format, item.series,
      item.access === "members-only" ? "Members only" : null,
      item.status.kind === "cancelled" ? "Cancelled"
        : item.status.availability === "sold-out" ? "Sold out" : null,
      item.start.kind === "event" ? startLabel(item.start) : null,
      item.start.kind === "screening" && item.start.doorsAt
        ? `Doors ${clock.format(new Date(item.start.doorsAt))}` : null,
    ].filter((value): value is string => value !== null);
    return `<li><time datetime="${escape(item.start.at)}">${escape(clock.format(new Date(item.start.at)))}</time>
<div><a href="${escape(item.ticketUrl ?? item.eventUrl)}">${escape(item.title)}</a>
<p>${labels.map(escape).join(" · ")}</p></div></li>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${date} · Twin Cities screenings</title>
<style>body{font:17px/1.5 system-ui,sans-serif;max-width:44rem;margin:auto;padding:1rem;color:#20231f;background:#faf9f4}a{color:#215a44;text-underline-offset:.2em}nav{display:flex;gap:1rem;flex-wrap:wrap}h1{font-size:1.65rem}ul{list-style:none;padding:0}li{display:grid;grid-template-columns:5.5rem 1fr;gap:1rem;padding:1rem 0;border-bottom:1px solid #d5d8ce}li a{font-weight:650}p{margin:.25rem 0;font-size:.9rem}time{font-variant-numeric:tabular-nums}footer{margin-top:2rem;font-size:.85rem}.notice{border-left:3px solid #a16920;padding-left:.75rem}:focus-visible{outline:3px solid #a16920;outline-offset:4px}</style></head>
<body><header><p>TWIN CITIES MOVIE SCREENINGS</p><nav aria-label="Dates">${links}</nav>
<h1>${date}</h1><p>Times in America/Chicago. Tickets and latest details are on the venue’s site.</p></header>
<main>${sources.some(source => source.stale) ? '<p class="notice">Saved source data may be stale. This schedule may be incomplete.</p>' : ""}
${rows ? `<ul aria-label="Screenings">${rows}</ul>` : "<p>No screenings found in the saved data for this date.</p>"}</main>
<footer><h2>Source freshness</h2>${sources.map(source => `<p><strong>${venueNames[source.sourceId]}</strong> — ${source.checkedAt ? escape(stamp.format(new Date(source.checkedAt))) : "Never checked"}${source.stale ? " · May be stale" : ""}. ${escape(source.note)}</p>`).join("\n")}</footer></body></html>`;
}
