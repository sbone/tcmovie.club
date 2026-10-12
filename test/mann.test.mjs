import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseMann, mannDays } from "../dist/sources/mann.js";

const fixture = await readFile(new URL("./fixtures/mann/grandview-day2.html", import.meta.url), "utf8");

test("Mann Grandview captured date has four bookable screenings, not Rewind promotions", () => {
  const parsed = parseMann(fixture, "grandview", "2026-10-14");
  assert.equal(parsed.kind, "ok");
  assert.equal(parsed.value.screenings.length, 4);
  assert.deepEqual(parsed.value.screenings.map(s => s.title).sort(), [
    "The Social Reckoning", "The Social Reckoning", "Verity", "Verity",
  ]);
  assert.ok(parsed.value.screenings.every(s => s.ticketUrl?.includes("/booking/83-")));
  assert.ok(!parsed.value.screenings.some(s => s.title === "The Lost Boys"));
  assert.ok(mannDays(fixture).includes(2));
});

test("Mann rejects mismatched date/theater and changed page shape", () => {
  assert.equal(parseMann(fixture, "grandview", "2026-10-15").kind, "err");
  assert.equal(parseMann(fixture, "highland", "2026-10-14").kind, "err");
  assert.equal(parseMann(fixture.replace('aria-label="Now playing"', 'aria-label="Different"'), "grandview", "2026-10-14").kind, "err");
});

test("Mann Highland uses same HTML contract and distinct IDs", () => {
  const highland = fixture.replaceAll("Grandview 1 &amp; 2", "Highland 1 &amp; 2")
    .replaceAll("Grandview 1 \\u0026 2", "Highland 1 \\u0026 2")
    .replaceAll("Grandview 1 & 2", "Highland 1 & 2")
    .replaceAll("grandview-1-2", "highland-1-2")
    .replaceAll("/booking/83-", "/booking/85-");
  const parsed = parseMann(highland, "highland", "2026-10-14");
  assert.equal(parsed.kind, "ok");
  assert.equal(parsed.value.screenings.length, 4);
  assert.ok(parsed.value.screenings.every(s => s.venueId === "highland" && s.sourceId === "highland"));
});
