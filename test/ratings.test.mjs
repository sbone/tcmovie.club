import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fetchRatings, movieQuery } from "../dist/ratings.js";

const day = 86_400_000;
const start = Date.parse("2026-09-29T12:00:00Z");
const detail = { Response: "True", Title: "Akira", Year: "1988", Type: "movie", imdbID: "tt0094625",
  Ratings: [{ Source: "Metacritic", Value: "67/100" }, { Source: "Rotten Tomatoes", Value: "91%" },
    { Source: "Internet Movie Database", Value: "8.0/10" }] };

test("lookup cleanup removes only explicit trailing years and formats", () => {
  for (const title of ["AKIRA (1988)", "AKIRA (1988) in 35mm", "AKIRA in 35mm (1988)", "AKIRA (1988) (4K)"]) {
    assert.deepEqual(movieQuery(title), { title: "AKIRA", year: "1988" });
  }
  assert.deepEqual(movieQuery("Suspiria in 4K"), { title: "Suspiria", year: null });
  assert.deepEqual(movieQuery("Day of Wrath in 35mm"), { title: "Day of Wrath", year: null });
  for (const title of ["1917", "Class of 1984", "1984", "In 35mm", "Film (Director’s Cut)",
    "Film + Short", "Opening Night: Film", "Poltergeist (1982) 35mm presentation w/ pre-movie DJ set"]) {
    assert.deepEqual(movieQuery(title), { title, year: null });
  }
});

test("changed queries retry cached misses, constrain years, and leave ambiguous remakes unrated", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-ratings-cleanup-"));
  const calls = [];
  const clock = { now: () => start, fetch: async url => {
    const q = url.searchParams;
    calls.push(q);
    if (q.has("i")) return Response.json(detail);
    const Search = q.get("s") === "AKIRA"
      ? [{ Title: "Akira", Year: "1988", Type: "movie", imdbID: "tt0094625" },
        { Title: "Akira", Year: "2016", Type: "movie", imdbID: "tt1234567" }]
      : ["1977", "2018"].map((Year, i) => ({ Title: "Suspiria", Year, Type: "movie", imdbID: `tt123456${i}` }));
    return Response.json({ Response: "True", totalResults: String(Search.length), Search });
  } };
  try {
    const old = { checkedAt: new Date(start).toISOString(), movie: null };
    await writeFile(join(directory, "ratings.json"), JSON.stringify({
      date: "2026-09-29", requests: 89, retryAt: 0,
      entries: { "akira (1988)": old, "suspiria in 4k": old, untouched: old },
    }));
    const titles = ["AKIRA (1988)", "Suspiria in 4K", "Untouched"];
    const ratings = await fetchRatings(titles, directory, "key", clock);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].get("s"), "AKIRA");
    assert.equal(calls[0].get("y"), "1988");
    assert.equal(calls[2].get("s"), "Suspiria");
    assert.equal(calls[2].has("y"), false);
    assert.equal(ratings["akira (1988)"].movie.imdbId, "tt0094625");
    assert.equal(ratings["suspiria in 4k"].movie, null);
    assert.equal(JSON.parse(await readFile(join(directory, "ratings.json"), "utf8")).requests, 92);
    await fetchRatings(titles, directory, "key", clock);
    assert.equal(calls.length, 3, "cleaned misses keep their normal retry interval");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("detail year must agree with the listing even when search appeared to match", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-ratings-year-"));
  const clock = { now: () => start, fetch: async url => Response.json(url.searchParams.has("i")
    ? { ...detail, Year: "2016" }
    : { Response: "True", totalResults: "1", Search: [detail] }) };
  try {
    const ratings = await fetchRatings(["Akira (1988)"], directory, "key", clock);
    assert.equal(ratings["akira (1988)"], undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("OMDb deduplicates titles, rejects ambiguous matches, caches, and retains data on failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-ratings-"));
  let now = start;
  const calls = [];
  const clock = { now: () => now, fetch: async (url, init) => {
    assert.equal(url.origin, "https://www.omdbapi.com");
    assert.equal(init.redirect, "error");
    assert.ok(init.signal);
    const q = url.searchParams;
    calls.push(q);
    if (q.has("i")) return Response.json(detail);
    const title = q.get("s");
    if (title === "Unknown") return Response.json({ Response: "False", Error: "Movie not found!" });
    const Search = title === "Remake" ? [1980, 2020].map((year, i) => ({ Title: title, Year: String(year), Type: "movie", imdbID: `tt123456${i}` }))
      : [{ Title: "Akira", Year: "1988", Type: "movie", imdbID: "tt0094625" }];
    return Response.json({ Response: "True", Search, totalResults: String(Search.length) });
  } };
  try {
    const titles = ["Akira", "AKIRA", "Remake", "Unknown", "Fuzzy title"];
    const first = await fetchRatings(titles, directory, "test-key", clock);
    assert.equal(calls.length, 5);
    assert.deepEqual(first.akira.movie, { imdbId: "tt0094625", title: "Akira", year: "1988", metacritic: 67, rottenTomatoes: 91, imdb: 8 });
    assert.equal(first.remake.movie, null);
    assert.equal(first.unknown.movie, null);
    assert.equal(first["fuzzy title"].movie, null);
    assert.deepEqual(await fetchRatings(titles, directory, "test-key", clock), first);
    assert.equal(calls.length, 5);
    now += 8 * day;
    const refreshed = await fetchRatings(["Akira"], directory, "test-key", clock);
    assert.equal(calls.length, 6, "refresh matched movies directly by ID");
    assert.notEqual(refreshed.akira.checkedAt, first.akira.checkedAt);
    now += 8 * day;
    const fail = { now: () => now, fetch: async () => { throw new Error("error contains secret-key"); } };
    assert.deepEqual(await fetchRatings(["Akira"], directory, "secret-key", fail), refreshed);
    const noNetwork = { now: () => now, fetch: async () => assert.fail("Unexpected request") };
    assert.deepEqual(await fetchRatings(["Akira"], directory, "test-key", noNetwork), refreshed);
    now += day;
    assert.deepEqual(await fetchRatings(["Akira"], directory, undefined, noNetwork), refreshed);
    assert.doesNotMatch(await readFile(join(directory, "ratings.json"), "utf8"), /secret-key|test-key/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("OMDb bounds requests across runs and rejects corrupt cache files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-ratings-budget-"));
  const path = join(directory, "ratings.json");
  let requests = 0;
  const clock = { now: () => start, fetch: async () => {
    requests++;
    return Response.json({ Response: "False", Error: "Movie not found!" });
  } };
  try {
    await fetchRatings(Array.from({ length: 201 }, (_, i) => `Unknown ${i}`), directory, "key", clock);
    assert.equal(requests, 200);
    const cache = JSON.parse(await readFile(path, "utf8"));
    cache.requests = 800; cache.retryAt = 0;
    await writeFile(path, JSON.stringify(cache));
    await fetchRatings(["Another"], directory, "key", clock);
    assert.equal(requests, 200);
    await fetchRatings(["Another"], directory, "key", { ...clock, now: () => start + day });
    assert.equal(requests, 201);
    await writeFile(path, "{}");
    await assert.rejects(fetchRatings([], directory, undefined, clock));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("invalid scores stay unknown and incomplete searches never become confident matches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-ratings-invalid-"));
  try {
    let requests = 0;
    const clock = { now: () => start, fetch: async url => {
      requests++;
      if (url.searchParams.get("s") === "Broad") return Response.json({ Response: "False", Error: "Too many results." });
      if (url.searchParams.has("i")) return Response.json({ ...detail, Ratings: [
        { Source: "Metacritic", Value: "N/A" }, { Source: "Rotten Tomatoes", Value: "101%" },
        { Source: "Internet Movie Database", Value: "-1/10" },
      ] });
      return Response.json({ Response: "True", totalResults: url.searchParams.get("s") === "Crowded" ? "50" : "1",
        Search: [{ Title: url.searchParams.get("s"), Year: "1988", Type: "movie", imdbID: "tt0094625" }] });
    } };
    const ratings = await fetchRatings(["Broad", "Akira", "Crowded"], directory, "key", clock);
    assert.equal(requests, 4);
    assert.equal(ratings.broad.movie, null);
    assert.equal(ratings.akira.movie.metacritic, null);
    assert.equal(ratings.akira.movie.rottenTomatoes, null);
    assert.equal(ratings.akira.movie.imdb, null);
    assert.equal(ratings.crowded.movie, null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
