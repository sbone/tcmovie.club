import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { collect } from "../dist/collect.js";
import { createHttp, readHttp, userAgent, dayMs } from "../dist/http.js";
import { acceptSource, emptySource, readSource } from "../dist/store.js";
import { loadCapturedSource } from "../dist/captures.js";
import { combineParsed } from "../dist/parse.js";
import { parseRiverview, parseRiverviewSpecials } from "../dist/sources/riverview.js";

const read = (source, name) => readFile(`test/fixtures/${source}/${name}`, "utf8");
const agent = userAgent("https://example.com/movies");
const morning = Date.parse("2026-09-29T12:00:00Z");
const fixtures = new Map();
for (const source of ["heights", "riverview", "parkway"]) {
  for (const name of await readdir(`test/fixtures/${source}`)) {
    if (!name.endsWith(".metadata.json")) continue;
    const metadata = JSON.parse(await read(source, name));
    fixtures.set(metadata.sourceUrl, await read(source, name.replace(".metadata.json", ".html")));
  }
}
fixtures.set("https://www.trylon.org/feed/my-calendar-google/", await read("trylon", "calendar.ics"));
const mainCalendar = JSON.parse(await read("main", "calendar.json"));

function fakeClock() {
  let now = morning;
  const calls = [];
  const clock = { now: () => now, sleep: async ms => { now += ms; }, fetch: async (url, init) => {
    calls.push({ url, init, at: now });
    assert.equal(init.redirect, "manual");
    assert.match(init.headers["User-Agent"], /tc-movie-cal/);
    const path = new URL(url).pathname;
    let body = path === "/robots.txt" ? "User-agent: *\nDisallow:\n" : fixtures.get(url);
    if (path === "/wp-json/gecko-theme/v1/calendar-events") {
      const q = new URL(url).searchParams;
      body = JSON.stringify({ events: mainCalendar.events.filter(group =>
        group.date >= q.get("start_date") && group.date < q.get("end_date")) });
    }
    if (!body && path.startsWith("/base/index/")) {
      const date = new Date(`${path.slice(-10)}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
      body = `<h2>Now Playing - ${date}</h2><div class="blog-sidebar"><ul class="playing">there aren't any showtimes scheduled at the moment</ul></div>`;
    }
    assert.ok(body, `Unexpected request: ${url}`);
    const headers = { "Content-Type": path === "/robots.txt" ? "text/plain" : path.includes("/feed/") ? "text/calendar" : path.startsWith("/wp-json/") ? "application/json" : "text/html", Date: new Date(now).toUTCString(), ETag: '"fixture"' };
    return init.headers["If-None-Match"] ? new Response(null, { status: 304, headers }) : new Response(body, { headers });
  } };
  return { clock, calls, setTime: value => { now = value; } };
}

test("collector discovers sources, rotates bounded details, preserves failures, and never reads demo corrections", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-collect-"));
  try {
    const storage = join(directory, "state"), output = join(directory, "site");
    const options = { contact: "https://example.com/movies", storage, output, enableTrylon: true };
    const fake = fakeClock();
    const first = await collect(options, fake.clock);
    assert.equal(first.failed, false);
    const trylon = await readSource(storage, "trylon");
    assert.equal(trylon.state.snapshot.screenings.length, 193);
    assert.ok(trylon.state.snapshot.screenings.every(show => !show.id.includes("reviewed")));
    const heights = await readSource(storage, "heights");
    assert.equal(heights.state.snapshot.screenings.length, 38);
    assert.equal(heights.state.snapshot.screenings.find(show => show.id === "heights:570").format, "DCP");
    assert.equal((await readSource(storage, "main")).state.snapshot.screenings.length, 194);
    assert.ok(fake.calls.some(call => call.url.includes("start_date=2026-09-29&end_date=2026-10-13&_locale=user")));
    assert.ok(first.sources.find(source => source.sourceId === "parkway").diagnostics.some(note => note.message.includes("Request limit")));
    assert.ok(first.sources.find(source => source.sourceId === "riverview").diagnostics.some(note => note.record === "Canoe Dig It?"));
    for (const host of new Set(fake.calls.map(call => new URL(call.url).host))) {
      const calls = fake.calls.filter(call => new URL(call.url).host === host);
      assert.ok(calls.length <= 6);
      calls.slice(1).forEach((call, i) => assert.ok(call.at - calls[i].at >= 10_000));
    }
    const count = fake.calls.length;
    await collect(options, fake.clock);
    assert.equal(fake.calls.length, count, "same window must make no requests");
    fake.setTime(Date.parse("2026-09-30T00:00:00Z")); // 7 PM Chicago
    const second = await collect(options, fake.clock);
    assert.equal(second.failed, false);
    assert.equal(fake.calls.filter(call => call.url.includes("trylon")).length, 2, "Trylon never runs in the evening");
    const updated = await readSource(storage, "heights");
    assert.equal(updated.state.snapshot.changedAt, heights.state.snapshot.changedAt);
    assert.ok(updated.state.snapshot.checkedAt > heights.state.snapshot.checkedAt);
    for (const source of ["trylon", "heights", "parkway", "riverview", "main"]) {
      assert.ok((await readHttp(join(storage, "http"), source)).requestsToday <= 12);
    }
    assert.ok(fake.calls.some(call => call.init.headers["If-None-Match"] === '"fixture"'));
    const parkway = await readSource(storage, "parkway");
    const preview = parkway.state.snapshot.screenings.filter(show => show.start.at < "2026-10-13");
    assert.ok(preview.every(show => show.start.kind === "screening"), "both bounded passes reach all seven preview details");
    const oldFetch = fake.clock.fetch;
    fake.clock.fetch = async (url, init) => url.startsWith("https://www.heightstheater.com") ? new Response("Unavailable", { status: 503, headers: { "Retry-After": "172800" } }) : oldFetch(url, init);
    fake.setTime(morning + dayMs + 60_000);
    assert.equal((await collect(options, fake.clock)).failed, true);
    const failed = await readSource(storage, "heights");
    assert.equal(failed.state.kind, "failed");
    assert.deepEqual(failed.state.lastGood, updated.state.snapshot);
    const http = await readHttp(join(storage, "http"), "heights");
    assert.ok(http.nextAttemptAt >= morning + 3 * dayMs);
    assert.equal((await readSource(storage, "parkway")).state.kind, "ready");
    const html = await readFile(join(output, "index.html"), "utf8");
    assert.match(html, /Import failed/);
    assert.equal(JSON.parse(await readFile(join(output, "sources.json"))).length, 5);
    let forbidden = 0;
    fake.clock.fetch = async (url, init) => { if (url.includes("heightstheater")) forbidden++; return oldFetch(url, init); };
    fake.setTime(morning + dayMs + 12 * 3_600_000);
    await collect(options, fake.clock);
    assert.equal(forbidden, 0, "Retry-After survives process runs");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("manual Trylon fallback preserves provenance without fetching or seeding live state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-saved-trylon-"));
  try {
    const capture = await loadCapturedSource("trylon", "test/fixtures");
    const savedTrylon = acceptSource(emptySource(), "trylon", capture.result, capture.responseAt);
    const options = { contact: "https://tcmovie.club", storage: join(directory, "state"), output: join(directory, "site"), savedTrylon };
    const fake = fakeClock();
    const first = await collect(options, fake.clock);
    const info = first.sources.find(source => source.sourceId === "trylon");
    assert.equal(info.checkedAt, capture.responseAt);
    assert.equal(info.stale, true);
    assert.match(info.note, /original capture date/);
    assert.equal(fake.calls.some(call => call.url.includes("trylon")), false);
    assert.equal((await readSource(options.storage, "trylon")).state.kind, "not-checked");
    const shows = JSON.parse(await readFile(join(options.output, "screenings.json")));
    assert.ok(shows.some(show => show.title === "Je Tu Il Elle"));
    const calls = fake.calls.length;
    await collect(options, fake.clock);
    assert.equal(fake.calls.length, calls, "rebuilding must preserve per-window limits");
    await collect({ ...options, enableTrylon: true }, fake.clock);
    const live = await readSource(options.storage, "trylon");
    assert.equal(live.state.snapshot.screenings.length, 193, "live collection must not include offline corrections");
    await collect(options, fake.clock);
    const current = JSON.parse(await readFile(join(options.output, "screenings.json")));
    assert.equal(current.some(show => show.title === "Je Tu Il Elle"), false, "saved fallback must not override a live snapshot");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("HTTP boundary honors robots, conditional responses, redirects, type and size limits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-http-"));
  try {
    const fake = fakeClock();
    let state = await readHttp(directory, "parkway");
    let http = createHttp("parkway", agent, state, async () => {}, fake.clock);
    await http.checkRobots();
    await http.request("/movies", "html");
    await http.request("/movies", "html");
    assert.equal(fake.calls.at(-1).init.headers["If-None-Match"], '"fixture"');
    const count = fake.calls.length;
    await assert.rejects(http.request("https://tickets.example.com/checkout", "html"), /Unapproved/);
    await assert.rejects(http.request("/movies?format=json", "html"), /Unapproved/);
    assert.equal(fake.calls.length, count);
    for (const response of [
      () => new Response(null, { status: 302, headers: { Location: "https://other.example.com/movies" } }),
      () => new Response("oops", { headers: { "Content-Type": "application/json" } }),
      () => new Response("x".repeat(2_000_001), { headers: { "Content-Type": "text/html" } }),
      () => new Response(null, { status: 304 }),
      () => new Response("denied", { status: 403 }),
    ]) {
      state = await readHttp(directory, "parkway");
      fake.clock.fetch = async url => new URL(url).pathname === "/robots.txt"
        ? new Response("User-agent: *\nDisallow:\n", { headers: { "Content-Type": "text/plain" } }) : response();
      http = createHttp("parkway", agent, state, async () => {}, fake.clock);
      await http.checkRobots();
      await assert.rejects(http.request("/movies", "html"));
    }
    fake.clock.fetch = async () => new Response("User-agent: *\nDisallow: /movies\n", { headers: { "Content-Type": "text/plain" } });
    http = createHttp("parkway", agent, await readHttp(directory, "parkway"), async () => {}, fake.clock);
    await http.checkRobots();
    await assert.rejects(http.request("/movies", "html"), /robots.txt/);
    assert.throws(() => userAgent(""));
    assert.throws(() => userAgent("https://example.com\r\nInjected:yes"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Riverview special/daily overlap merges optional metadata but rejects conflicting facts", async () => {
  const home = await read("riverview", "home.html");
  assert.equal(parseRiverview(home, {}, "2026-09-30").kind, "err", "a cached or redirected page must match the requested date");
  const specials = parseRiverviewSpecials(await read("riverview", "special.html"), home);
  const show = specials.value.screenings.find(show => show.title === "They're Here");
  const daily = parseRiverview(`<h2>Now Playing - Wednesday, October 7, 2026</h2><div class="blog-sidebar"><ul class="playing"><li><a href="${new URL(show.eventUrl).pathname}">${show.title}</a><br>5:45PM</li></ul></div>`);
  const combined = combineParsed([daily, specials]);
  assert.equal(combined.value.diagnostics.filter(note => note.kind === "invalid").length, 0);
  assert.equal(combined.value.screenings.filter(item => item.id === show.id).length, 1);
  assert.equal(combined.value.screenings.find(item => item.id === show.id).series, "Special screening");
  const conflict = { kind: "ok", value: { screenings: [{ ...show, title: "Different film" }], diagnostics: [] } };
  assert.ok(combineParsed([daily, conflict]).value.diagnostics.some(note => note.kind === "invalid"));
});

test("collector refuses overlapping runs and validates identity before any network work", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-lock-"));
  try {
    const options = { contact: "", storage: directory, output: join(directory, "site") };
    const clock = { now: () => morning, sleep: async () => {}, fetch: async () => { assert.fail("No network expected"); } };
    await assert.rejects(collect(options, clock), /TC_CONTACT/);
    await mkdir(join(directory, "collect.lock"));
    await assert.rejects(collect({ ...options, contact: "test@example.com" }, clock), /EEXIST/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("access failures remain paused and Trylon's 24-hour guard survives the spring DST change", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-policy-"));
  try {
    const httpDirectory = join(directory, "http");
    await mkdir(httpDirectory);
    for (const source of ["heights", "parkway", "riverview", "main"]) {
      await writeFile(join(httpDirectory, `${source}.json`), JSON.stringify({ paused: "Review required" }));
    }
    const options = { contact: "test@example.com", storage: directory, output: join(directory, "site"), enableTrylon: true };
    const fake = fakeClock();
    const lastRequestAt = Date.parse("2026-03-07T13:00:10Z"); // 7 AM CST
    await writeFile(join(httpDirectory, "trylon.json"), JSON.stringify({ lastRequestAt }));
    fake.setTime(Date.parse("2026-03-08T12:00:00Z")); // 7 AM CDT, only 23 hours later
    await collect(options, fake.clock);
    assert.equal(fake.calls.length, 0);
    fake.setTime(Date.parse("2026-03-09T12:01:00Z"));
    await collect(options, fake.clock);
    assert.equal(fake.calls.length, 2);
    assert.ok(fake.calls.every(call => call.url.includes("trylon")));
    fake.setTime(Date.parse("2026-03-10T12:02:00Z"));
    let calls = 0;
    fake.clock.fetch = async () => { calls++; return new Response("Forbidden", { status: 403 }); };
    await collect(options, fake.clock);
    assert.equal(calls, 1, "a denied robots request stops this source immediately");
    assert.match((await readHttp(httpDirectory, "trylon")).paused, /403/);
    fake.setTime(Date.parse("2026-03-12T12:00:00Z"));
    await collect(options, fake.clock);
    assert.equal(calls, 1, "paused sources do not automatically retry");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("HTTP request accounting, crawl delay, cached age and Retry-After stay bounded", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-limits-"));
  try {
    const fake = fakeClock();
    const state = await readHttp(directory, "parkway");
    fake.clock.fetch = async (url, init) => {
      fake.calls.push({ url, init, at: fake.clock.now() });
      assert.ok(init.signal instanceof AbortSignal);
      return new Response(new URL(url).pathname === "/robots.txt"
        ? "User-agent: *\nDisallow: /all-events/*\nAllow: /all-events/allowed$\nCrawl-delay: 30\n"
        : "<html>schedule</html>", { headers: { "Content-Type": url.endsWith("robots.txt") ? "text/plain" : "text/html", Age: "3600", Date: new Date(fake.clock.now()).toUTCString(), "Last-Modified": "Mon, 28 Sep 2026 12:00:00 GMT" } });
    };
    const http = createHttp("parkway", agent, state, async () => {}, fake.clock);
    await http.checkRobots();
    await assert.rejects(http.request("/all-events/blocked", "html"), /robots.txt/);
    const allowed = await http.request("/all-events/allowed", "html");
    assert.equal(allowed.responseAt, fake.clock.now() - 3_600_000);
    assert.ok(fake.calls[1].at - fake.calls[0].at >= 30_000);
    for (let i = 0; i < 4; i++) await http.request("/movies", "html");
    assert.equal(state.requestsToday, 6);
    assert.equal(fake.calls.at(-1).init.headers["If-Modified-Since"], "Mon, 28 Sep 2026 12:00:00 GMT");
    await assert.rejects(http.request("/movies", "html"), /budget/);
    const another = createHttp("parkway", agent, state, async () => {}, fake.clock);
    await another.checkRobots();
    fake.clock.fetch = async () => new Response("Slow down", { status: 429, headers: { "Retry-After": "7200" } });
    await assert.rejects(another.request("/movies", "html"), error => error.retryAt === fake.clock.now() + 7_200_000);
    fake.clock.fetch = async () => { throw new DOMException("Request timed out", "TimeoutError"); };
    await assert.rejects(another.request("/movies", "html"), error => error.kind === "network");
    state.requestsToday = 12;
    await assert.rejects(another.request("/movies", "html"), /budget/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
