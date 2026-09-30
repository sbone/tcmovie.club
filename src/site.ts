import { startLabel, timeZone } from "./domain.js";
import type { Screening, SourceId } from "./domain.js";
import { chicagoDate } from "./time.js";
import { mkdir, writeFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import { gzipSync } from "node:zlib";
import type { Diagnostic } from "./parse.js";
import { initTheaterFilters } from "./filters.js";
import { socialCard } from "./social.js";

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
  await mkdir(`${output}/social`, { recursive: true });
  for (const date of dates) {
    const card = socialCard(date, screenings.filter(item => chicagoDate(item.start.at) === date));
    const png = new Resvg(card.svg).render().asPng();
    await writeFile(`${output}${card.imagePath}`, png);
    if (date === dates[0]) await writeFile(`${output}/social-card.png`, png);
    const html = renderDate(date, screenings, sources, dates, false);
    await mkdir(`${output}/${date}`, { recursive: true });
    await writePage(`${output}/${date}/index.html`, html);
    if (date === dates[0]) await writePage(`${output}/index.html`, renderDate(date, screenings, sources, dates, true));
  }
  await writeFile(`${output}/screenings.json`, `${JSON.stringify(screenings, null, 2)}\n`);
  await writeFile(`${output}/sources.json`, `${JSON.stringify(sources, null, 2)}\n`);
}

export function renderDate(date: string, screenings: readonly Screening[], sources: readonly SourceInfo[], dates: readonly string[] = [date], home = false): string {
  const label = shareDate.format(new Date(`${date}T12:00:00Z`));
  const day = screenings.filter(item => chicagoDate(item.start.at) === date)
    .sort((a, b) => a.start.at.localeCompare(b.start.at) || a.title.localeCompare(b.title));
  const card = socialCard(date, day);
  const title = `See films on ${label} · Twin Cities Movie Club`;
  const description = card.description;
  const url = home ? "https://tcmovie.club/" : `https://tcmovie.club/${date}/`;
  const image = `https://tcmovie.club${card.imagePath}`;
  const imageAlt = card.alt;
  const links = dates.map(value => `<a href="/${escape(value)}/"${value === date ? ' aria-current="date"' : ""}>${escape(dayLabel.format(new Date(`${value}T12:00:00Z`)))}</a>`).join(" ");
  const rows = day.map(item => {
    const labels = [item.format, item.series,
      item.access === "members-only" ? "Members only" : null,
      item.status.kind === "cancelled" ? "Cancelled"
        : item.status.availability === "sold-out" ? "Sold out" : null,
      item.start.kind === "event" ? startLabel(item.start) : null,
      item.start.kind === "screening" && item.start.doorsAt
        ? `Doors ${clock.format(new Date(item.start.doorsAt))}` : null,
    ].filter((value): value is string => value !== null);
    return `<li data-venue="${item.venueId}"><time datetime="${escape(item.start.at)}">${escape(clock.format(new Date(item.start.at)))}</time>
<div><a href="${escape(item.ticketUrl ?? item.eventUrl)}">${escape(item.title)}</a>
<p><span class="venue-badge">${escape(venueNames[item.venueId])}</span>${labels.length ? ` · ${labels.map(escape).join(" · ")}` : ""}</p></div></li>`;
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
<style>
:root{color-scheme:light;--paper:#faf9f4;--ink:#20231f;--link:#215a44;--rule:#d5d8ce;--hover:#e9e9e6;--notice:#a16920;--on-venue:#faf9f4;--selected-bg:#20231f;--selected-ink:#faf9f4}
html{min-height:100%;background:var(--paper)}
body{font:17px/1.5 system-ui,sans-serif;max-width:44rem;margin:auto;padding:1rem;color:var(--ink)}a{color:var(--link);text-underline-offset:.2em}nav{display:flex;gap:.5rem;overflow-x:auto;padding:.5rem}nav a{flex:none;box-sizing:border-box;min-height:44px;padding:.45rem .65rem;border:1px solid transparent;border-radius:.3rem;text-decoration:none}nav [aria-current=date]{font-weight:700;background:var(--selected-bg);color:var(--selected-ink);border-color:currentColor;text-decoration:underline;text-decoration-thickness:2px}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}.screenings{list-style:none;padding:0}.screenings li{display:grid;grid-template-columns:5.5rem 1fr;gap:1rem;padding:1rem 0;border-bottom:1px solid var(--rule)}li a{font-weight:650}p{margin:.25rem 0;font-size:.9rem}time{font-variant-numeric:tabular-nums}footer{margin-top:2rem;font-size:.85rem}.notice{border-left:3px solid var(--notice);padding-left:.75rem}:focus-visible{outline:3px solid var(--ink);outline-offset:4px}
/* Venue names and checkmarks carry meaning independently of color. */
[data-theater=trylon],[data-venue=trylon]{--venue-color:#215a44;--venue-tint:#e4e9e2}
[data-theater=heights],[data-venue=heights]{--venue-color:#704470;--venue-tint:#ece7e7}
[data-theater=parkway],[data-venue=parkway]{--venue-color:#91451f;--venue-tint:#f0e7df}
[data-theater=riverview],[data-venue=riverview]{--venue-color:#285f8f;--venue-tint:#e5eaea}
[data-theater=main],[data-venue=main]{--venue-color:#515d6b;--venue-tint:#e9e9e6}
.venue-badge{display:inline-block;padding:.1em .45em;border-radius:.25rem;font-weight:600;color:var(--venue-color);background:var(--venue-tint)}
[hidden]{display:none!important}#theater-filters{border:0;padding:0;margin:1.1rem 0 .5rem}#theater-filters legend{font-size:.9rem;font-weight:650;margin-bottom:.5rem}.theater-buttons{display:flex;flex-wrap:wrap;gap:.6rem}.theater-buttons button{font:inherit;font-size:.9rem;min-height:44px;padding:.4rem .7rem;border:1px solid var(--venue-color,var(--link));border-radius:.3rem;background:var(--paper);color:var(--venue-color,var(--link));cursor:pointer}.theater-buttons button[aria-pressed=true]{background:var(--venue-color);color:var(--on-venue)}.theater-buttons button[data-theater]::before{content:"";display:inline-block;width:1em}.theater-buttons button[aria-pressed=true]::before{content:"✓"}.theater-buttons button:disabled{border-color:var(--rule);cursor:default}#filter-status{min-height:1.5em;margin:.5rem 0}
@media(hover:hover){a:hover{text-decoration-thickness:.14em}nav a:not([aria-current]):hover{background:var(--hover);text-decoration:underline}.theater-buttons button:not(:disabled):hover{background:var(--venue-tint,var(--hover))}.theater-buttons button[aria-pressed=true]:hover{background:var(--venue-color);box-shadow:inset 0 0 0 1px var(--on-venue)}}
.theater-buttons button:not(:disabled):active{box-shadow:inset 0 0 0 2px currentColor}
h1{font-size:1.1rem;font-weight:650;margin:1rem 0 .2rem}.site-name a{display:inline-block;padding:.2rem 0;color:inherit;text-decoration:none}.site-name a:hover{text-decoration:underline}.schedule-notes{margin-top:1.25rem}
footer hr{border:0;border-top:1px solid var(--rule);margin:1.5rem 0 .75rem}.footer-links{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.5rem 1.5rem}.footer-links span{margin-left:auto;text-align:right}
@media(prefers-color-scheme:dark){
:root{color-scheme:dark;--paper:#171410;--ink:#eee3cf;--link:#d4b888;--rule:#625547;--hover:#30291f;--notice:#d4b888;--on-venue:#171410;--selected-bg:#ddc59c;--selected-ink:#211c15}
html{background-image:linear-gradient(180deg,#231d16,var(--paper) 32rem);background-repeat:no-repeat}
[data-theater=trylon],[data-venue=trylon]{--venue-color:#afc7a8;--venue-tint:#263029}
[data-theater=heights],[data-venue=heights]{--venue-color:#cfb6d6;--venue-tint:#302631}
[data-theater=parkway],[data-venue=parkway]{--venue-color:#e7b88a;--venue-tint:#352a21}
[data-theater=riverview],[data-venue=riverview]{--venue-color:#aec6dc;--venue-tint:#242c34}
[data-theater=main],[data-venue=main]{--venue-color:#c8c0b4;--venue-tint:#2e2a24}
}
@media(prefers-contrast:more){:root{--rule:var(--ink)}html{background-image:none}}
@media(forced-colors:active){
html{background-image:none}
.theater-buttons button[aria-pressed=true],nav [aria-current=date]{background:Highlight;color:HighlightText;border-color:Highlight}
.venue-badge{border:1px solid CanvasText}
:focus-visible{outline-color:Highlight}
}
</style></head>
<body><header><p class="site-name"><a href="/">tcmovie.club</a></p>
<h1>Screenings on<span class="visually-hidden"> ${escape(label)}</span></h1>
<nav aria-label="Dates">${links}</nav></header>
<main>
<fieldset id="theater-filters" hidden><legend>Theaters</legend><div class="theater-buttons">
${Object.entries(venueNames).map(([id, name]) => `<button type="button" data-theater="${id}" aria-pressed="true">${id === "main" ? "Main" : escape(name)}</button>`).join("\n")}
<button type="button" data-reset>Show all</button></div></fieldset>
<noscript><p>All theaters are shown. Enable JavaScript to filter by theater.</p></noscript>
<p id="filter-status" role="status" aria-live="polite">${rows ? "" : "No screenings found in the saved data for this date."}</p>
${rows ? `<ul class="screenings" aria-label="Screenings">${rows}</ul>` : ""}
<div class="schedule-notes"><p>Times in America/Chicago. Tickets and latest details are on the venue’s site.</p>
${sources.some(source => source.stale) ? '<p class="notice">Saved source data may be stale. This schedule may be incomplete.</p>' : sources.some(source => source.incomplete) ? '<p class="notice">Some dates or screening details remain unconfirmed. Check the venue for its latest schedule.</p>' : ""}</div>
<section aria-labelledby="about-tcmc"><h2 id="about-tcmc">About TCMC</h2>
<p>Built by <a href="https://letterboxd.com/sbone/">a film enthusiast</a> who wanted one place to see what's playing on a random night.</p>
<p>Twin Cities Movie Screenings brings showtimes from these fine theaters into one place:</p>
<ul><li><a href="https://www.trylon.org/">Trylon Cinema</a></li>
<li><a href="https://www.heightstheater.com/">Heights Theater</a></li>
<li><a href="https://theparkwaytheater.com/">The Parkway Theater</a></li>
<li><a href="https://www.riverviewtheater.com/">Riverview Theater</a></li>
<li><a href="https://mspfilm.org/">The Main Cinema</a></li></ul>
</section></main>
<footer><h2>Source freshness</h2>${sources.map(source => `<p><strong>${venueNames[source.sourceId]}</strong> — ${source.checkedAt ? escape(stamp.format(new Date(source.checkedAt))) : "Never checked"}${source.stale ? " · May be stale" : ""}. ${escape(source.note)}</p>`).join("\n")}
<hr><div class="footer-links"><a href="https://github.com/sbone/tcmovie.club">Source on GitHub</a><span>A <a href="https://qualityti.me">Quality Time</a> Effort</span></div>
</footer><script>(${initTheaterFilters.toString()})();
document.querySelector('nav [aria-current="date"]')?.scrollIntoView({block:"nearest",inline:"center"});</script></body></html>`;
}
