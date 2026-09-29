import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { instantSchema, sourceIdSchema, sourceScreenings } from "./domain.js";
import { loadCapturedSource } from "./captures.js";
import { acceptSource, failed, lastGood, readSource, writeSource } from "./store.js";
import { dedupe } from "./dedupe.js";
import { errorMessage } from "./parse.js";
import { datesFrom } from "./time.js";
import { renderDate } from "./site.js";
import type { SourceInfo } from "./site.js";
import type { Screening } from "./domain.js";

const firstDate = process.argv[2] ?? "2026-09-29";
const captures = resolve(process.argv[3] ?? "test/fixtures");
const output = resolve(process.argv[4] ?? "site");
const storage = resolve(process.argv[5] ?? ".state/demo");
const dates = datesFrom(firstDate, 14);
const screenings: Screening[] = [];
const sources: SourceInfo[] = [];
const notes = {
  trylon: "Saved calendar; coverage is unverified and end times are unavailable.",
  heights: "Saved homepage; future coverage may be incomplete.",
  riverview: "Saved daily listing and film details; future coverage is incomplete.",
  parkway: "Saved movie listing and one detail page; unconfirmed film times are labeled.",
};
let rejected = false;
for (const sourceId of sourceIdSchema.options) {
  const previous = await readSource(storage, sourceId);
  let next;
  try {
    const capture = await loadCapturedSource(sourceId, captures);
    next = acceptSource(previous, sourceId, capture.result, capture.responseAt);
  } catch (error) {
    next = failed(previous, { kind: "parse", message: errorMessage(error), at: instantSchema.parse(new Date().toISOString()) });
  }
  await writeSource(storage, sourceId, next);
  screenings.push(...sourceScreenings(next.state));
  const snapshot = lastGood(next.state);
  sources.push({ sourceId, checkedAt: snapshot?.checkedAt ?? null, stale: true,
    note: `${notes[sourceId]}${next.state.kind === "failed" ? " Import failed; retaining last-known-good data." : ""}` });
  if (next.state.kind === "failed") { rejected = true; console.error(`${sourceId}: ${next.state.error.message}`); }
}
const combined = dedupe(screenings);
for (const date of dates) {
  const html = renderDate(date, combined, sources, dates);
  if (gzipSync(html).length > 25000) throw new Error(`HTML exceeds compressed 25 KB budget: ${date}`);
  await mkdir(`${output}/${date}`, { recursive: true });
  await writeFile(`${output}/${date}/index.html`, html);
  if (date === firstDate) await writeFile(`${output}/index.html`, html);
}
await writeFile(`${output}/screenings.json`, `${JSON.stringify(combined, null, 2)}\n`);
console.log(`Generated 14 date pages from ${combined.length} screenings across four saved sources. No network requests.`);
if (rejected) process.exitCode = 1;
