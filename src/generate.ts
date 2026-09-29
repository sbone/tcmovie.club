import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseTrylon } from "./sources/trylon.js";
import { datesFrom } from "./time.js";
import { renderDate } from "./site.js";

const firstDate = process.argv[2] ?? "2026-09-29";
const parsed = parseTrylon(await readFile("test/fixtures/trylon/calendar.ics", "utf8"));
if (parsed.kind === "err") throw new Error(parsed.error);
if (parsed.value.diagnostics.some(note => note.kind === "invalid")) {
  throw new Error(JSON.stringify(parsed.value.diagnostics));
}
const source = { sourceId: "trylon", checkedAt: "2026-09-29T11:16:22Z", stale: true,
  note: "Offline preview from a saved calendar; no live source check was made." } as const;
const dates = datesFrom(firstDate, 14);
for (const date of dates) {
  await mkdir(`site/${date}`, { recursive: true });
  const html = renderDate(date, parsed.value.screenings, [source], dates);
  await writeFile(`site/${date}/index.html`, html);
  if (date === firstDate) await writeFile("site/index.html", html);
}
console.log(`Generated 14 date pages from ${parsed.value.screenings.length} Trylon-feed screenings. No network requests.`);
