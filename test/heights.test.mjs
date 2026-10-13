import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { load } from "cheerio";
import { parseHeights, parseHeightsCalendar } from "../dist/sources/heights.js";
import { collectSource } from "../dist/sources/collect.js";
import { combineParsed } from "../dist/parse.js";
import { acceptSource, emptySource, failed } from "../dist/store.js";

const read = name => readFileSync(new URL(`./fixtures/heights/regressions/${name}.html`, import.meta.url), "utf8");
const calendar = read("calendar-external");
const silverUrl = "https://www.sph.umn.edu/event/silver-screamers-2026-age-friendly-umn-movie-screening/";
const silverHome = `<div class="featured"><a class="featured-img-link" href="/films-and-events/silver-screamers"></a><div class="featured-title"><h2>Silver Screamers</h2></div><div class="showtime"><a href="${silverUrl}"><time datetime="2026-10-20 14:00">2:00pm</time></a></div></div>`;

test("Heights skips captured View All navigation but still validates actual showtimes", () => {
  for (const name of ["home-ueck", "home-concrete"]) {
    const raw = read(name);
    const result = parseHeights(raw);
    assert.equal(result.kind, "ok");
    assert.equal(result.value.screenings.length, 5);
    assert.deepEqual(result.value.diagnostics.map(note => note.kind), ["excluded"]);
    assert.match(result.value.diagnostics[0].message, /navigation/i);
    const $ = load(raw);
    $(".showtime").first().find("time").remove();
    assert.ok(parseHeights($.html()).value.diagnostics.some(note => note.kind === "invalid" && note.message === "Missing time"));
    assert.ok(parseHeights(raw.replace("showtime view-all", "showtime")).value.diagnostics.some(note => note.kind === "invalid"));
  }
});

test("Heights external tickets retain dates, distinct sessions and identities across homepage/calendar", () => {
  const result = parseHeightsCalendar(calendar);
  assert.equal(result.kind, "ok");
  assert.deepEqual(result.value.diagnostics, []);
  const silver = result.value.screenings.find(show => show.title === "Silver Screamers");
  assert.equal(silver.start.at, "2026-10-20T19:00:00.000Z");
  assert.equal(silver.ticketUrl, silverUrl);
  assert.equal(silver.eventUrl, "https://www.heightstheater.com/films-and-events/silver-screamers");
  assert.deepEqual(parseHeights(silverHome).value.screenings, [silver]);
  const combined = combineParsed([result, parseHeights(silverHome)]);
  assert.deepEqual(combined.value.diagnostics, []);
  assert.deepEqual(combined.value.screenings, result.value.screenings);
  const houdini = result.value.screenings.filter(show => show.title === "Houdini 100");
  assert.deepEqual(houdini.map(show => show.start.at), [
    "2026-10-29T23:30:00.000Z", "2026-10-30T01:30:00.000Z",
    "2026-10-30T23:30:00.000Z", "2026-10-31T01:30:00.000Z",
    "2026-10-31T23:30:00.000Z", "2026-11-01T01:30:00.000Z",
  ]);
  assert.equal(new Set(houdini.map(show => show.id)).size, 6);
  assert.equal(result.value.screenings.find(show => show.title === "Ueck").id, "heights:679");
  assert.equal(parseHeights(silverHome.replace(silverUrl, `${silverUrl}?tracking=changed`)).value.screenings[0].id, silver.id);
});

test("Heights still rejects missing, internal-broken and unsafe ticket links and unreadable times", () => {
  for (const href of ["", "#", "/order/add-tickets/broken/nojs", "https://www.heightstheater.com/order/add-tickets/broken/nojs", "javascript:alert(1)", "https://user:secret@example.com/tickets"]) {
    for (const result of [parseHeights(silverHome.replace(silverUrl, href)), parseHeightsCalendar(calendar.replace(silverUrl, href))]) {
      assert.ok(result.value.diagnostics.some(note => note.kind === "invalid"), href);
    }
  }
  assert.ok(parseHeights(silverHome.replace("2026-10-20 14:00", "TBA")).value.diagnostics.some(note => note.kind === "invalid"));
  assert.ok(parseHeightsCalendar(calendar.replace("2:00pm", "TBA")).value.diagnostics.some(note => note.kind === "invalid"));
});

test("Heights collection recovers from the captured failures without requesting external tickets", async () => {
  const pages = new Map([["/", read("home-concrete")], ["/calendar", calendar]]);
  const requests = [];
  const at = "2026-10-13T05:30:56.000Z";
  const capture = await collectSource("heights", {
    checkRobots: async () => {},
    request: async path => {
      requests.push(path);
      assert.ok(pages.has(path), `Unexpected request: ${path}`);
      return { body: pages.get(path), responseAt: Date.parse(at) };
    },
  }, "2026-10-13");
  assert.deepEqual(requests, ["/", "/calendar"]);
  const previous = acceptSource(emptySource(), "heights", parseHeights(read("home-concrete")), "2026-10-12T05:30:00.000Z");
  const broken = failed(previous, { kind: "validation", at, message: "Missing time; Missing stable calendar showtime ID" });
  const recovered = acceptSource(broken, "heights", capture.result, capture.responseAt,
    { firstDate: "2026-10-13", lastDate: "2026-10-26" });
  assert.equal(recovered.state.kind, "ready");
  assert.equal(recovered.state.snapshot.checkedAt, at);
  assert.equal(recovered.state.snapshot.screenings.length, 9);
  assert.ok(recovered.state.snapshot.screenings.some(show => show.title === "Silver Screamers"));
  assert.ok(!recovered.state.snapshot.screenings.some(show => show.title === "Houdini 100"));
});
