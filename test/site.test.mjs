import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { load } from "cheerio";
import { parseTrylon } from "../dist/sources/trylon.js";
import { renderDate, venueNames } from "../dist/site.js";

const parsed = parseTrylon(readFileSync(new URL("./fixtures/trylon/calendar.ics", import.meta.url), "utf8"));
assert.equal(parsed.kind, "ok");
const sources = [{ sourceId: "trylon", checkedAt: "2026-09-29T11:16:22Z", stale: true, note: "Saved calendar" }];

test("HTML renders complete listings and accessible theater toggles", () => {
  const html = renderDate("2027-02-24", parsed.value.screenings, sources);
  assert.match(html, /Trylon Club Exclusive Screening/);
  assert.match(html, /Members only/);
  assert.match(html, /7:00 PM/);
  assert.match(html, /Sep 29, 2026/);
  assert.match(html, /Marked listings may be stale/);
  const $ = load(html);
  assert.equal($("img, script[src], link:not([rel=canonical])").length, 0);
  assert.equal($("script").length, 1);
  assert.equal($("#theater-filters[hidden] button[data-theater][aria-pressed=true]").length, 7);
  assert.equal($(".screenings li[data-venue=trylon]").length, 1);
  assert.equal($(".screenings li[data-venue=trylon] .venue-badge").text(), "Trylon");
  assert.match($("noscript").text(), /All theaters are shown/);
  assert.ok(gzipSync(html).length < 25000);
});

test("source freshness links every theater and shares stale/incomplete notices once", () => {
  const allSources = Object.keys(venueNames).map(sourceId => ({ sourceId,
    checkedAt: "2026-10-13T13:35:18.000Z", stale: sourceId === "parkway", incomplete: true,
    note: "Some dates or screening details remain unconfirmed; check the venue for its full schedule.",
    error: sourceId === "heights" ? "<script>bad listing</script>" : null,
  }));
  allSources.find(source => source.sourceId === "highland").checkedAt = null;
  const $ = load(renderDate("2026-10-13", [], allSources));
  const table = $("table.source-freshness");
  assert.equal(table.attr("aria-labelledby"), "source-freshness");
  assert.deepEqual(table.find("thead th[scope=col]").map((_, el) => $(el).text()).get(), ["Theater", "Last checked (Central)"]);
  assert.deepEqual(table.find("tbody th[scope=row] a").map((_, el) => $(el).text()).get(), Object.values(venueNames));
  assert.deepEqual(table.find("tbody a").map((_, el) => $(el).attr("href")).get(), [
    "https://www.trylon.org/", "https://www.heightstheater.com/", "https://theparkwaytheater.com/",
    "https://www.riverviewtheater.com/", "https://mspfilm.org/", "https://www.manntheatres.com/?theatre=grandview-1-2",
    "https://www.manntheatres.com/?theatre=highland-1-2",
  ]);
  assert.equal(table.find("tbody tr").length, 7);
  assert.equal(table.find('time[datetime="2026-10-13T13:35:18.000Z"]').length, 6);
  assert.equal(table.find("time").first().text(), "Oct 13, 2026, 8:35 AM");
  assert.equal(table.find('td[aria-describedby="source-notice"] sup').length, 3);
  assert.match(table.find("tr").last().text(), /Never checked/);
  assert.equal($("#source-notice").length, 1);
  assert.equal(($("body").text().match(/may be stale/g) ?? []).length, 1);
  assert.equal(($("body").text().match(/may be incomplete/g) ?? []).length, 1);
  assert.doesNotMatch($("body").text(), /remain unconfirmed|bad listing/);
  assert.match($("footer").text(), /Import failed for Heights; showing saved listings/);
  assert.equal($("#about-tcmc").parent().find("li").length, 0, "the theater links appear in the table once");
  const fresh = load(renderDate("2026-10-13", [], [{ ...sources[0], stale: false }]));
  assert.equal(fresh("#source-notice, .source-freshness sup").length, 0);
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
  assert.equal(venues.length, 14);
  const gradientTop = css.match(/linear-gradient\(180deg,(#[a-f0-9]{6})/)[1];
  for (const [index, theme] of themes.entries()) {
    const backgrounds = index ? [theme.paper, gradientTop] : [theme.paper];
    const pairs = backgrounds.flatMap(background => [[theme.ink, background], [theme.link, background]]);
    pairs.push([theme.link, theme.hover], [theme["selected-ink"], theme["selected-bg"]]);
    for (const venue of venues.slice(index * 7, index * 7 + 7)) {
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
