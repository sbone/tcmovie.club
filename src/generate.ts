import { resolve } from "node:path";
import { instantSchema, sourceIdSchema, sourceScreenings } from "./domain.js";
import { loadCapturedSource } from "./captures.js";
import { acceptSource, failed, lastGood, readSource, writeSource } from "./store.js";
import { dedupe } from "./dedupe.js";
import { errorMessage } from "./parse.js";
import { datesFrom } from "./time.js";
import { writeSite } from "./site.js";
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
  trylon: "Saved calendar plus reviewed indexed film-page corrections; live coverage remains unverified.",
  heights: "Saved homepage and September/October calendars cover the preview window.",
  riverview: "Saved daily listings through October 1 plus special screenings. October 2 is explicitly not yet scheduled.",
  parkway: "Saved movie listing and detail schedules confirm film/program starts through October 12; later times may be unconfirmed.",
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
await writeSite(output, dates, combined, sources);
console.log(`Generated 14 date pages from ${combined.length} screenings across four saved sources. No network requests.`);
if (rejected) process.exitCode = 1;
