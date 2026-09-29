import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseMain } from "../dist/sources/main.js";
import { createHttp, userAgent } from "../dist/http.js";

const fixture = await readFile("test/fixtures/main/calendar.json", "utf8");

test("Main calendar resolves displayed Chicago times and excludes other venues", () => {
  const result = parseMain(fixture);
  assert.equal(result.kind, "ok");
  assert.equal(result.value.screenings.length, 194);
  assert.equal(result.value.diagnostics.filter(note => note.kind === "excluded").length, 5);
  assert.equal(result.value.diagnostics.filter(note => note.kind === "invalid").length, 0);
  const weight = result.value.screenings.find(show => show.id === "main:153031");
  assert.equal(weight.start.at, "2026-10-01T18:00:00.000Z");
  assert.equal(weight.endsAt, null);
  assert.equal(weight.eventUrl, "https://mspfilm.org/show/the-weight-2/");
  assert.equal(parseMain("<html>blocked</html>").kind, "err");
});

test("Main HTTP boundary accepts only the observed bounded calendar route", async () => {
  let now = Date.parse("2026-09-29T12:00:00Z");
  const calls = [];
  const clock = { now: () => now, sleep: async ms => { now += ms; }, fetch: async (url, init) => {
    calls.push({ url, init });
    return new Response(url.endsWith("/robots.txt") ? "User-agent: *\nDisallow:\n" : fixture,
      { headers: { "Content-Type": url.endsWith("/robots.txt") ? "text/plain" : "application/json" } });
  } };
  const state = { day: "", requestsToday: 0, slot: "", lastRequestAt: 0, nextAttemptAt: 0,
    failures: 0, paused: null, pages: {} };
  const http = createHttp("main", userAgent("https://tcmovie.club"), state, async () => {}, clock);
  await http.checkRobots();
  const path = "/wp-json/gecko-theme/v1/calendar-events?start_date=2026-09-29&end_date=2026-10-13&_locale=user";
  await http.request(path, "json");
  assert.equal(calls.at(-1).init.headers.Accept, "application/json");
  await assert.rejects(http.request("/wp-json/wp/v2/users", "json"), /Unapproved/);
  await assert.rejects(http.request(`${path}&page=2`, "json"), /Unapproved/);
  await assert.rejects(http.request(path.replace("2026-10-13", "2027-10-13"), "json"), /Unapproved/);
  assert.equal(calls.length, 2);
});
