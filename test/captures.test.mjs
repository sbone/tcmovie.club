import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { loadCapturedSource } from "../dist/captures.js";
import { parseHeightsCalendar } from "../dist/sources/heights.js";
import { parseRiverview, parseRiverviewSpecials } from "../dist/sources/riverview.js";
import { parseParkway } from "../dist/sources/parkway.js";
import { chicagoDate } from "../dist/time.js";
import { dedupe } from "../dist/dedupe.js";

const read = (venue, name) => readFileSync(new URL(`./fixtures/${venue}/${name}`, import.meta.url), "utf8");
const captured = async venue => {
  const { result } = await loadCapturedSource(venue, "test/fixtures");
  assert.equal(result.kind, "ok");
  assert.deepEqual(result.value.diagnostics.filter(item => item.kind === "invalid"), []);
  return result.value;
};

test("captured inputs cover the reviewed 14-day window without cross-listed duplicates", async () => {
  const all = [];
  for (const [venue, count, inWindow] of [["trylon", 196, 30], ["heights", 38, 30], ["riverview", 13, 9], ["parkway", 16, 8]]) {
    const { screenings } = await captured(venue);
    assert.equal(screenings.length, count);
    assert.equal(screenings.filter(item => chicagoDate(item.start.at) >= "2026-09-29"
      && chicagoDate(item.start.at) <= "2026-10-12").length, inWindow);
    all.push(...screenings);
  }
  const combined = dedupe(all);
  const kiki = combined.filter(item => item.venueId === "heights" && chicagoDate(item.start.at) === "2026-10-10"
    && item.title.startsWith("Kiki"));
  assert.equal(kiki.length, 1);
  assert.equal(kiki[0].sourceId, "heights");
  assert.equal(kiki[0].format, "4K");
});

test("Trylon reviewed corrections restore today's films, sold-out status and all three Horrorthon sessions", async () => {
  const { screenings } = await captured("trylon");
  assert.deepEqual(screenings.filter(item => item.title === "Je Tu Il Elle").map(item => item.start.at), [
    "2026-09-30T00:00:00.000Z", "2026-09-30T02:00:00.000Z",
  ]);
  assert.equal(screenings.find(item => item.title === "Season of the Witch in 35mm").status.availability, "sold-out");
  assert.deepEqual(screenings.filter(item => item.title === "Horrorthon X").map(item => [item.start.at, item.endsAt]), [
    ["2026-10-09T21:00:00.000Z", "2026-10-10T05:00:00.000Z"],
    ["2026-10-10T15:00:00.000Z", "2026-10-10T23:00:00.000Z"],
    ["2026-10-11T01:00:00.000Z", "2026-10-11T09:00:00.000Z"],
  ]);
});

test("Heights calendar adds missing dates and formats while preserving explicit homepage DCP", async () => {
  const { screenings } = await captured("heights");
  assert.deepEqual(screenings.find(item => item.id === "heights:612").start,
    { kind: "screening", at: "2026-10-09T00:00:00.000Z", doorsAt: null });
  assert.equal(screenings.find(item => item.id === "heights:612").format, "70mm");
  assert.equal(screenings.find(item => item.id === "heights:570").format, "DCP");
  assert.equal(screenings.find(item => item.id === "heights:610").title, "Parasite");
  assert.equal(parseHeightsCalendar("<title>October 2026 | Heights Theater</title><div class='calendar-cell' id='day1'></div>").kind, "err");
  const damaged = parseHeightsCalendar(read("heights", "calendar-october.html").replace('id="day8"', 'id="day99"'));
  assert.ok(damaged.value.diagnostics.some(item => item.kind === "invalid"));
});

test("Riverview includes dated listings and specials, distinguishing unscheduled dates from broken markup", async () => {
  const { screenings, diagnostics } = await captured("riverview");
  assert.equal(screenings.find(item => item.title === "Coyote vs. Acme" && chicagoDate(item.start.at) === "2026-10-01").start.at,
    "2026-10-01T21:30:00.000Z");
  const special = screenings.find(item => item.title === "They're Here");
  assert.equal(special.start.at, "2026-10-07T22:45:00.000Z");
  assert.equal(special.series, "Special screening");
  assert.ok(diagnostics.some(item => item.record === "Canoe Dig It?" && item.kind === "warning"));
  const empty = parseRiverview(read("riverview", "date-2026-10-02.html"));
  assert.equal(empty.kind, "ok");
  assert.deepEqual(empty.value.screenings, []);
  assert.equal(empty.value.diagnostics[0].record, "2026-10-02");
  assert.equal(parseRiverview("<html>No data</html>").kind, "err");
  const rollover = read("riverview", "home.html").replace("Tuesday, September 29, 2026", "Thursday, December 31, 2026");
  const future = read("riverview", "special.html").replace("Wednesday, October 7th", "Friday, January 1st");
  const parsed = parseRiverviewSpecials(future, rollover);
  assert.equal(parsed.value.screenings.find(item => item.title === "They're Here").start.at, "2027-01-01T23:45:00.000Z");
  const leap = read("riverview", "home.html").replace("Tuesday, September 29, 2026", "Tuesday, February 1, 2028");
  const leapSpecial = read("riverview", "special.html").replace("Wednesday, October 7th", "Tuesday, February 29th");
  const leapParsed = parseRiverviewSpecials(leapSpecial, leap);
  assert.equal(leapParsed.value.screenings.find(item => item.title === "They're Here").start.at, "2028-02-29T23:45:00.000Z");
});

test("Parkway confirms every film/program start in the preview, including both HUMP screenings", async () => {
  const { screenings } = await captured("parkway");
  const window = screenings.filter(item => chicagoDate(item.start.at) <= "2026-10-12");
  assert.ok(window.every(item => item.start.kind === "screening"));
  assert.equal(screenings.find(item => item.sourceEventId === "/all-events/programme-4").start.at, "2026-10-08T00:30:00.000Z");
  const hump = screenings.filter(item => item.sourceEventId === "/all-events/hump-fall-2026");
  assert.deepEqual(hump.map(item => [item.start.at, item.start.doorsAt]), [
    ["2026-10-10T23:30:00.000Z", "2026-10-10T22:30:00.000Z"],
    ["2026-10-11T02:00:00.000Z", "2026-10-11T01:30:00.000Z"],
  ]);
  assert.equal(new Set(hump.map(item => item.id)).size, 2);
  const ambiguous = read("parkway", "hump.html").replace("8:30 pm Doors", "Doors TBA");
  const broken = parseParkway(read("parkway", "movies.html"), { "/all-events/hump-fall-2026": ambiguous });
  assert.ok(broken.value.diagnostics.some(item => item.kind === "invalid"));
});
