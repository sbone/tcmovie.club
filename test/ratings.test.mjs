import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fetchRatings } from "../dist/ratings.js";

const day = 86_400_000;
const start = Date.parse("2026-09-29T12:00:00Z");
const detail = { Response: "True", Title: "Akira", Year: "1988", Type: "movie", imdbID: "tt0094625",
  Ratings: [{ Source: "Metacritic", Value: "67/100" }, { Source: "Rotten Tomatoes", Value: "91%" },
    { Source: "Internet Movie Database", Value: "8.0/10" }] };

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
