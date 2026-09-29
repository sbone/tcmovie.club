import { startLabel, timeZone } from "./domain.js";
import type { Screening, SourceId } from "./domain.js";
import { chicagoDate } from "./time.js";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import type { Diagnostic } from "./parse.js";
import { initTheaterFilters } from "./filters.js";

export const venueNames = {
  trylon: "Trylon", heights: "Heights", parkway: "Parkway", riverview: "Riverview", main: "The Main Cinema",
} as const;

export type SourceInfo = Readonly<{
  sourceId: SourceId;
  checkedAt: string | null;
  stale: boolean;
  note: string;
  changedAt?: string | null;
  diagnostics?: readonly Diagnostic[];
  error?: string | null;
  incomplete?: boolean;
}>;

const escape = (text: string): string => text.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char] ?? char);
const clock = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
const stamp = new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" });
const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const shareDate = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });

export async function writeSite(output: string, dates: readonly string[], screenings: readonly Screening[], sources: readonly SourceInfo[]) {
  const writePage = async (path: string, html: string) => {
    if (gzipSync(html).length > 25000) throw new Error(`HTML exceeds compressed 25 KB budget: ${path}`);
    await writeFile(path, html);
  };
  await mkdir(output, { recursive: true });
  await copyFile(new URL("../assets/social-card.png", import.meta.url), `${output}/social-card.png`);
  for (const date of dates) {
    const html = renderDate(date, screenings, sources, dates);
    await mkdir(`${output}/${date}`, { recursive: true });
    await writePage(`${output}/${date}/index.html`, html);
    if (date === dates[0]) await writePage(`${output}/index.html`, renderDate(date, screenings, sources, dates, true));
  }
  await writeFile(`${output}/screenings.json`, `${JSON.stringify(screenings, null, 2)}\n`);
  await writeFile(`${output}/sources.json`, `${JSON.stringify(sources, null, 2)}\n`);
}

export function renderDate(date: string, screenings: readonly Screening[], sources: readonly SourceInfo[], dates: readonly string[] = [date], home = false): string {
  const label = shareDate.format(new Date(`${date}T12:00:00Z`));
  const title = home ? "Twin Cities Movie Screenings · tcmovie.club" : `Movies for ${label} · tcmovie.club`;
  const description = home
    ? "Pick a night. Find a film at the Twin Cities' unique theaters. An independent guide built by a local film enthusiast, for the love of going to the movies."
    : `Explore movie screenings for ${label} at the Twin Cities' unique theaters. Check each theater for tickets and the latest details.`;
  const url = home ? "https://tcmovie.club/" : `https://tcmovie.club/${date}/`;
  const image = "https://tcmovie.club/social-card.png";
  const imageAlt = "Twin Cities Movie Screenings: Pick a night. Find a film. A green cinema marquee beside tcmovie.club.";
  const day = screenings.filter(item => chicagoDate(item.start.at) === date)
    .sort((a, b) => a.start.at.localeCompare(b.start.at) || a.title.localeCompare(b.title));
  const links = dates.map(value => `<a href="/${escape(value)}/"${value === date ? ' aria-current="date"' : ""}>${escape(dayLabel.format(new Date(`${value}T12:00:00Z`)))}</a>`).join(" ");
  const rows = day.map(item => {
    const labels = [venueNames[item.venueId], item.format, item.series,
      item.access === "members-only" ? "Members only" : null,
      item.status.kind === "cancelled" ? "Cancelled"
        : item.status.availability === "sold-out" ? "Sold out" : null,
      item.start.kind === "event" ? startLabel(item.start) : null,
      item.start.kind === "screening" && item.start.doorsAt
        ? `Doors ${clock.format(new Date(item.start.doorsAt))}` : null,
    ].filter((value): value is string => value !== null);
    return `<li data-venue="${item.venueId}"><time datetime="${escape(item.start.at)}">${escape(clock.format(new Date(item.start.at)))}</time>
<div><a href="${escape(item.ticketUrl ?? item.eventUrl)}">${escape(item.title)}</a>
<p>${labels.map(escape).join(" · ")}</p></div></li>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en" prefix="og: https://ogp.me/ns#"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<link rel="canonical" href="${escape(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="tcmovie.club">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${escape(url)}">
<meta property="og:image" content="${image}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${imageAlt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(description)}">
<meta name="twitter:image" content="${image}">
<meta name="twitter:image:alt" content="${imageAlt}">
<style>body{font:17px/1.5 system-ui,sans-serif;max-width:44rem;margin:auto;padding:1rem;color:#20231f;background:#faf9f4}a{color:#215a44;text-underline-offset:.2em}nav{display:flex;gap:1rem;overflow-x:auto;padding:.5rem 0}nav a{flex:none;padding:.4rem 0}nav [aria-current]{font-weight:700}h1{font-size:1.65rem}.screenings{list-style:none;padding:0}.screenings li{display:grid;grid-template-columns:5.5rem 1fr;gap:1rem;padding:1rem 0;border-bottom:1px solid #d5d8ce}li a{font-weight:650}p{margin:.25rem 0;font-size:.9rem}time{font-variant-numeric:tabular-nums}footer{margin-top:2rem;font-size:.85rem}.notice{border-left:3px solid #a16920;padding-left:.75rem}:focus-visible{outline:3px solid #a16920;outline-offset:4px}
[hidden]{display:none!important}#theater-filters{border:0;padding:0;margin:1.1rem 0 .5rem}#theater-filters legend{font-size:.9rem;font-weight:650;margin-bottom:.5rem}.theater-buttons{display:flex;flex-wrap:wrap;gap:.4rem}.theater-buttons button{font:inherit;font-size:.9rem;min-height:44px;padding:.4rem .7rem;border:1px solid #215a44;border-radius:.3rem;background:transparent;color:#215a44;cursor:pointer}.theater-buttons button[aria-pressed=true]{background:#215a44;color:#faf9f4}.theater-buttons button[data-theater]::before{content:"";display:inline-block;width:1em}.theater-buttons button[aria-pressed=true]::before{content:"✓"}.theater-buttons button:disabled{opacity:.5;cursor:default}#filter-status{min-height:1.5em;margin:.5rem 0}</style></head>
<body><header><p>tcmovie.club</p><nav aria-label="Dates">${links}</nav>
<h1>${escape(date)}</h1><p>Times in America/Chicago. Tickets and latest details are on the venue’s site.</p></header>
<main>${sources.some(source => source.stale) ? '<p class="notice">Saved source data may be stale. This schedule may be incomplete.</p>' : sources.some(source => source.incomplete) ? '<p class="notice">Some dates or screening details remain unconfirmed. Check the venue for its latest schedule.</p>' : ""}
<fieldset id="theater-filters" hidden><legend>Theaters</legend><div class="theater-buttons">
${Object.entries(venueNames).map(([id, name]) => `<button type="button" data-theater="${id}" aria-pressed="true">${id === "main" ? "Main" : escape(name)}</button>`).join("\n")}
<button type="button" data-reset>Show all</button></div></fieldset>
<noscript><p>All theaters are shown. Enable JavaScript to filter by theater.</p></noscript>
<p id="filter-status" role="status" aria-live="polite">${rows ? "" : "No screenings found in the saved data for this date."}</p>
${rows ? `<ul class="screenings" aria-label="Screenings">${rows}</ul>` : ""}
<section aria-labelledby="about-tcmc"><h2 id="about-tcmc">About TCMC</h2>
<p>Built by a film enthusiast who wanted one place to see what's playing on a random night. The Twin Cities have so many unique theaters. This is an invitation to explore them.</p>
<p>Twin Cities Movie Screenings brings showtimes from these theaters into one calendar:</p>
<ul><li><a href="https://www.trylon.org/">Trylon Cinema</a></li>
<li><a href="https://www.heightstheater.com/">Heights Theater</a></li>
<li><a href="https://theparkwaytheater.com/">The Parkway Theater</a></li>
<li><a href="https://www.riverviewtheater.com/">Riverview Theater</a></li>
<li><a href="https://mspfilm.org/">The Main Cinema</a></li></ul>
</section></main>
<footer><h2>Source freshness</h2>${sources.map(source => `<p><strong>${venueNames[source.sourceId]}</strong> — ${source.checkedAt ? escape(stamp.format(new Date(source.checkedAt))) : "Never checked"}${source.stale ? " · May be stale" : ""}. ${escape(source.note)}</p>`).join("\n")}</footer><script>(${initTheaterFilters.toString()})();</script></body></html>`;
}
