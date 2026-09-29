import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { load } from "cheerio";
import { parseTrylon } from "../dist/sources/trylon.js";
import { renderDate } from "../dist/site.js";

const parsed = parseTrylon(readFileSync(new URL("./fixtures/trylon/calendar.ics", import.meta.url), "utf8"));
assert.equal(parsed.kind, "ok");
const sources = [{ sourceId: "trylon", checkedAt: "2026-09-29T11:16:22Z", stale: true, note: "Saved calendar" }];

test("HTML renders complete listings and accessible theater toggles", () => {
  const html = renderDate("2027-02-24", parsed.value.screenings, sources);
  assert.match(html, /Trylon Club Exclusive Screening/);
  assert.match(html, /Members only/);
  assert.match(html, /7:00 PM/);
  assert.match(html, /Sep 29, 2026/);
  assert.match(html, /May be stale/);
  const $ = load(html);
  assert.equal($("img, script[src], link:not([rel=canonical])").length, 0);
  assert.equal($("script").length, 1);
  assert.equal($("#theater-filters[hidden] button[data-theater][aria-pressed=true]").length, 5);
  assert.equal($(".screenings li[data-venue=trylon]").length, 1);
  assert.match($("noscript").text(), /All theaters are shown/);
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
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /Event starts · film time unconfirmed/);
  assert.match(html, /Cancelled/);
  assert.match(renderDate("2026-09-28", records, sources), /No screenings found/);
});

test("homepage and dated pages have distinct share URLs and static large-image metadata", () => {
  for (const home of [true, false]) {
    const $ = load(renderDate("2026-09-29", [], sources, ["2026-09-29"], home));
    const meta = key => $(`meta[property="${key}"], meta[name="${key}"]`).attr("content");
    const url = home ? "https://tcmovie.club/" : "https://tcmovie.club/2026-09-29/";
    assert.equal($("link[rel=canonical]").attr("href"), url);
    assert.equal(meta("og:url"), url);
    assert.equal(meta("og:title"), $("title").text());
    assert.equal(meta("twitter:title"), meta("og:title"));
    assert.equal(meta("og:description"), meta("description"));
    assert.equal(meta("twitter:description"), meta("description"));
    assert.equal(meta("twitter:card"), "summary_large_image");
    assert.equal(meta("og:image"), "https://tcmovie.club/social-card.png");
    assert.equal(meta("twitter:image"), meta("og:image"));
    assert.ok(meta("og:image:alt"));
    if (home) assert.match(meta("description"), /film enthusiast/);
    else assert.match(meta("og:title"), /Tuesday, September 29, 2026/);
  }
});
