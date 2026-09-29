import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { parseTrylon } from "../dist/sources/trylon.js";
import { renderDate } from "../dist/site.js";

const parsed = parseTrylon(readFileSync(new URL("./fixtures/trylon/calendar.ics", import.meta.url), "utf8"));
assert.equal(parsed.kind, "ok");
const sources = [{ sourceId: "trylon", checkedAt: "2026-09-29T11:16:22Z", stale: true, note: "Saved calendar" }];

test("HTML renders membership, freshness, and useful content without scripts", () => {
  const html = renderDate("2027-02-24", parsed.value.screenings, sources);
  assert.match(html, /Trylon Club Exclusive Screening/);
  assert.match(html, /Members only/);
  assert.match(html, /7:00 PM/);
  assert.match(html, /Sep 29, 2026/);
  assert.match(html, /May be stale/);
  assert.doesNotMatch(html, /<script|<img|<link/i);
  assert.ok(gzipSync(html).length < 25000);
});

test("HTML escapes source text, sorts chronologically, and labels uncertain/cancelled events", () => {
  const base = parsed.value.screenings[0];
  const records = [
    { ...base, title: '<script>alert("x")</script>', start: { kind: "event", at: "2026-09-30T02:00:00.000Z" } },
    { ...base, title: "Earlier", start: { kind: "screening", at: "2026-09-30T00:00:00.000Z", doorsAt: null }, status: { kind: "cancelled" } },
  ];
  const html = renderDate("2026-09-29", records, sources);
  assert.ok(html.indexOf("Earlier") < html.indexOf("&lt;script&gt;"));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Event starts · film time unconfirmed/);
  assert.match(html, /Cancelled/);
  assert.match(renderDate("2026-09-28", records, sources), /No screenings found/);
});
