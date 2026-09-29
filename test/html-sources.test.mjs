import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseHeights } from "../dist/sources/heights.js";
import { parseRiverview } from "../dist/sources/riverview.js";
import { parseParkway } from "../dist/sources/parkway.js";
import { screeningSchema } from "../dist/domain.js";

const read = (venue, name) => readFileSync(new URL(`./fixtures/${venue}/${name}`, import.meta.url), "utf8");
const heights = read("heights", "home.html");
const riverview = read("riverview", "home.html");
const parkway = read("parkway", "movies.html");
const riverviewDetails = { "/show/show/3364": read("riverview", "film.html"), "/show/show/3410": read("riverview", "akira.html") };
const parkwayDetails = { "/all-events/poltergeist-26": read("parkway", "film.html") };

for (const [source, parse, raw, details, count] of [
  ["heights", parseHeights, heights, {}, 18],
  ["riverview", parseRiverview, riverview, riverviewDetails, 7],
  ["parkway", parseParkway, parkway, parkwayDetails, 15],
]) {
  test(`${source} capture matches reviewed outputs and the common screening contract`, () => {
    const result = parse(raw, details);
    assert.equal(result.kind, "ok");
    const { screenings, diagnostics } = result.value;
    assert.equal(screenings.length, count);
    assert.equal(new Set(screenings.map(item => item.id)).size, count);
    assert.equal(diagnostics.filter(item => item.kind === "invalid").length, 0);
    for (const item of screenings) {
      assert.equal(item.sourceId, source);
      assert.ok(screeningSchema.safeParse(item).success);
    }
    for (const expected of JSON.parse(read(source, "expected.json"))) {
      assert.deepEqual(screenings.find(item => item.id === expected.id), expected);
    }
    assert.equal(parse("<html>Site redesigned</html>").kind, "err");
  });
}

test("Heights skips series cards and does not invent a format when a showtime omits it", () => {
  const { value } = parseHeights(heights);
  assert.equal(value.diagnostics.filter(item => item.kind === "excluded").length, 1);
  assert.equal(value.screenings.find(item => item.id === "heights:571").format, null);
  const damaged = parseHeights(heights.replaceAll("2026-09-29 15:30", "TBA"));
  assert.ok(damaged.value.diagnostics.some(item => item.kind === "invalid"));
});

test("Parkway retains uncertain event times without detail pages and excludes passes", () => {
  const { value } = parseParkway(parkway);
  const poltergeist = value.screenings.find(item => item.sourceEventId === "/all-events/poltergeist-26");
  assert.deepEqual(poltergeist.start, { kind: "event", at: "2026-09-30T00:00:00.000Z" });
  assert.equal(value.diagnostics.filter(item => item.kind === "excluded").length, 1);
  assert.equal(value.screenings.some(item => item.title.includes("All Movie Pass")), false);
});

test("Riverview resolves year rollover from dated navigation, and rejects unmatched detail dates", () => {
  // Synthetic regression for the same captured markup, not a live schedule.
  const page = '<h2>Now Playing - Thursday, December 31, 2026</h2><div class="blog-sidebar"><ul class="playing"><li><a href="/show/show/1">Test</a><br>7:00PM</li></ul></div><a href="/base/index/2027-01-01">Friday</a>';
  const detail = '<dl id="listinginfo"><dt>Showtimes:</dt><dd>Friday (Jan 1st): 7:00PM</dd><dt>Rated:</dt></dl>';
  const result = parseRiverview(page, { "/show/show/1": detail });
  assert.equal(result.kind, "ok");
  assert.equal(result.value.diagnostics.length, 0);
  assert.deepEqual(result.value.screenings.map(item => item.start.at), ["2027-01-01T01:00:00.000Z", "2027-01-02T01:00:00.000Z"]);
  const damaged = parseRiverview(page, { "/show/show/1": detail.replace("Jan 1st", "Jan 8th") });
  assert.ok(damaged.value.diagnostics.some(item => item.kind === "invalid"));
});

test("Riverview includes Akira on both days and resolves its lingering past showtime", () => {
  const result = parseRiverview(riverview, riverviewDetails);
  assert.equal(result.kind, "ok");
  assert.deepEqual(result.value.diagnostics, []);
  assert.deepEqual(result.value.screenings.filter(item => item.title === "AKIRA (1988)").map(item => item.start.at), [
    "2026-09-27T21:00:00.000Z", "2026-09-29T21:30:00.000Z", "2026-09-30T21:30:00.000Z",
  ]);
});
