import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseTrylon } from "../dist/sources/trylon.js";
import { chicagoTime, chicagoDate } from "../dist/time.js";

const raw = readFileSync(new URL("./fixtures/trylon/calendar.ics", import.meta.url), "utf8");
const expected = JSON.parse(readFileSync(new URL("./fixtures/trylon/expected.json", import.meta.url), "utf8"));

test("captured Trylon feed matches reviewed records and reports the ticket-sale exclusion", () => {
  const result = parseTrylon(raw);
  assert.equal(result.kind, "ok");
  const { screenings, diagnostics } = result.value;
  assert.equal(screenings.length, 193);
  assert.equal(new Set(screenings.map(item => item.id)).size, 193);
  assert.equal(screenings.filter(item => item.venueId === "heights").length, 2);
  assert.ok(screenings.every(item => item.endsAt === null));
  assert.equal(diagnostics.filter(item => item.kind === "excluded").length, 1);
  assert.equal(diagnostics.filter(item => item.kind === "invalid").length, 0);
  for (const record of expected) assert.deepEqual(screenings.find(item => item.id === record.id), record);
});

test("calendar structural failure and unsupported recurrence cannot look like an empty success", () => {
  assert.equal(parseTrylon("403 Forbidden").kind, "err");
  assert.equal(parseTrylon(raw.replace("END:VCALENDAR", "")).kind, "err");
  assert.equal(parseTrylon("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR").kind, "err");
  const result = parseTrylon(raw.replace("SUMMARY:Manborg", "RRULE:FREQ=DAILY\r\nSUMMARY:Manborg"));
  assert.equal(result.kind, "ok");
  assert.ok(result.value.diagnostics.some(item => item.kind === "invalid" && item.record === "2980-920"));
});

test("Chicago wall times resolve independently of process timezone and reject DST ambiguity", () => {
  assert.equal(chicagoTime("2026-09-29T19:00:00"), "2026-09-30T00:00:00.000Z");
  assert.equal(chicagoTime("2026-12-16T19:00:00"), "2026-12-17T01:00:00.000Z");
  assert.equal(chicagoDate(chicagoTime("2026-10-10T00:15:00")), "2026-10-10");
  assert.throws(() => chicagoTime("2026-03-08T02:30:00"));
  assert.throws(() => chicagoTime("2026-11-01T01:30:00"));
  assert.throws(() => chicagoTime("2026-02-30T19:00:00"));
});
