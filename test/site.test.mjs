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
  assert.equal($(".screenings li[data-venue=trylon] .venue-badge").text(), "Trylon");
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
    assert.match(meta("og:image"), /^https:\/\/tcmovie\.club\/social\/2026-09-29-[a-f0-9]{12}\.png$/);
    assert.equal(meta("twitter:image"), meta("og:image"));
    assert.ok(meta("og:image:alt"));
    assert.match(meta("description"), /No screenings listed. See films on Tuesday, September 29, 2026/);
    assert.match(meta("og:title"), /Tuesday, September 29, 2026/);
  }
});

test("ratings controls, scores, and unavailable labels are absent", () => {
  const html = renderDate("2027-02-24", parsed.value.screenings, sources);
  const $ = load(html);
  assert.equal($("#ratings-control, #show-ratings, [data-ratings], .movie-ratings").length, 0);
  assert.doesNotMatch(html, /Ratings unavailable|Show ratings|www\.imdb\.com/);
  assert.ok($(".screenings li").length);
});

test("theme text and theater states retain contrast against surfaces and gradient endpoints", () => {
  const $ = load(renderDate("2026-09-29", [], sources));
  const css = $("style").text();
  const colors = rule => Object.fromEntries([...rule.matchAll(/--([\w-]+):(#[a-f0-9]{6})/g)].map(match => [match[1], match[2]]));
  const themes = [...css.matchAll(/:root\{([^}]+)\}/g)].slice(0, 2).map(match => colors(match[1]));
  const venues = [...css.matchAll(/\[data-theater=\w+\],\[data-venue=\w+\]\{([^}]+)\}/g)].map(match => colors(match[1]));
  const luminance = hex => hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
  const contrast = (a, b) => {
    const values = [luminance(a), luminance(b)].sort((a, b) => a - b);
    return (values[1] + .05) / (values[0] + .05);
  };
  assert.equal(themes.length, 2);
  assert.equal(venues.length, 10);
  const gradientTop = css.match(/linear-gradient\(180deg,(#[a-f0-9]{6})/)[1];
  for (const [index, theme] of themes.entries()) {
    const backgrounds = index ? [theme.paper, gradientTop] : [theme.paper];
    const pairs = backgrounds.flatMap(background => [[theme.ink, background], [theme.link, background]]);
    pairs.push([theme.link, theme.hover], [theme["selected-ink"], theme["selected-bg"]]);
    for (const venue of venues.slice(index * 5, index * 5 + 5)) {
      pairs.push([venue["venue-color"], venue["venue-tint"]], [theme["on-venue"], venue["venue-color"]]);
      for (const background of backgrounds) pairs.push([venue["venue-color"], background]);
    }
    for (const [foreground, background] of pairs) {
      const ratio = contrast(foreground, background);
      assert.ok(ratio >= (index ? 7 : 4.5), `${index ? "dark" : "light"}: ${foreground} on ${background}: ${ratio.toFixed(2)}:1`);
    }
  }
  assert.match(css, /@media\(prefers-color-scheme:dark\)/);
  assert.match(css, /@media\(forced-colors:active\)/);
  assert.match(css, /@media\(prefers-contrast:more\).*background-image:none/);
});
