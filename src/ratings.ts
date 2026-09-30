import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { instantSchema } from "./domain.js";
import { writeJson } from "./store.js";

const day = 86_400_000;
const imdbId = z.string().regex(/^tt\d{7,10}$/);
const movieSchema = z.object({
  imdbId, title: z.string(), year: z.string().regex(/^\d{4}$/),
  metacritic: z.number().int().min(0).max(100).nullable(),
  rottenTomatoes: z.number().int().min(0).max(100).nullable(),
  imdb: z.number().min(0).max(10).nullable(),
}).readonly();
const entrySchema = z.object({ checkedAt: instantSchema, movie: movieSchema.nullable() }).readonly();
export type FilmRatings = z.infer<typeof entrySchema>;
export type Ratings = Readonly<Record<string, FilmRatings>>;
const cacheSchema = z.object({
  entries: z.record(z.string(), entrySchema),
  date: z.string(), requests: z.number().int().nonnegative(), retryAt: z.number().nonnegative(),
});

export const ratingKey = (title: string) => title.normalize("NFKC").trim().toLowerCase()
  .replace(/[‘’]/g, "'").replace(/\s+/g, " ");

const responseSchema = z.discriminatedUnion("Response", [
  z.object({ Response: z.literal("True") }).passthrough(),
  z.object({ Response: z.literal("False"), Error: z.string() }),
]);
const searchSchema = z.object({
  totalResults: z.string().regex(/^\d+$/),
  Search: z.array(z.object({ Title: z.string(), Year: z.string(), imdbID: imdbId, Type: z.string() })),
});
const detailSchema = z.object({
  Title: z.string(), Year: z.string().regex(/^\d{4}$/), imdbID: imdbId, Type: z.literal("movie"),
  Ratings: z.array(z.object({ Source: z.string(), Value: z.string() })).default([]),
});
function score(value: string | undefined, suffix: string, maximum: number): number | null {
  if (!value?.endsWith(suffix)) return null;
  const number = value.slice(0, -suffix.length);
  if (!/^\d+(\.\d+)?$/.test(number)) return null;
  const result = Number(number);
  return result <= maximum && (maximum === 10 || Number.isInteger(result)) ? result : null;
}

// Called inside the collector's existing single-writer lock. No browser requests.
export async function fetchRatings(titles: readonly string[], directory: string, key: string | undefined,
  clock = { now: Date.now, fetch: globalThis.fetch }): Promise<Ratings> {
  let cache: z.infer<typeof cacheSchema> = { entries: {}, date: "", requests: 0, retryAt: 0 };
  try { cache = cacheSchema.parse(JSON.parse(await readFile(join(directory, "ratings.json"), "utf8"))); }
  catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const wanted = new Map(titles.map(title => [ratingKey(title), title]));
  const result = () => Object.fromEntries([...wanted.keys()].flatMap(id => cache.entries[id] ? [[id, cache.entries[id]]] : []));
  if (!key) {
    console.log("OMDb: no OMDB_API_KEY set; using saved ratings only.");
    return result();
  }
  if (clock.now() < cache.retryAt) {
    console.log("OMDb: waiting after a failed request; using saved ratings.");
    return result();
  }
  let requests = 0;
  const save = () => writeJson(directory, "ratings.json", cache);
  const request = async (params: Record<string, string>) => {
    const date = new Date(clock.now()).toISOString().slice(0, 10);
    if (date !== cache.date) { cache.date = date; cache.requests = 0; }
    if (requests >= 200 || cache.requests >= 800) throw new Error("Local request budget reached");
    requests++; cache.requests++;
    await save(); // Count attempts even if interrupted or rejected by the provider.
    const url = new URL("https://www.omdbapi.com/");
    url.search = new URLSearchParams({ ...params, apikey: key }).toString();
    const response = await clock.fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
    if (!response.ok) throw new Error("OMDb request failed");
    const body = responseSchema.parse(await response.json());
    if (body.Response === "False") {
      if (body.Error === "Movie not found!" || (params.s && body.Error === "Too many results.")) return null;
      throw new Error("OMDb rejected request");
    }
    return body;
  };
  for (const [id, title] of wanted) {
    const previous = cache.entries[id];
    if (previous && clock.now() - Date.parse(previous.checkedAt) < (previous.movie ? 7 : 1) * day) continue;
    try {
      let match = previous?.movie?.imdbId;
      if (!match) {
        const body = await request({ s: title, type: "movie" });
        const search = body ? searchSchema.parse(body) : null;
        const matches = search?.Search.filter(movie => movie.Type === "movie" && ratingKey(movie.Title) === id) ?? [];
        // Do not choose a remake, fuzzy result, or a match from an incomplete result set.
        if (search && Number(search.totalResults) <= search.Search.length && matches.length === 1) match = matches[0]!.imdbID;
      }
      let movie: z.infer<typeof movieSchema> | null = null;
      if (match) {
        const body = await request({ i: match });
        if (!body) throw new Error("Previously matched movie unavailable");
        const detail = detailSchema.parse(body);
        if (detail.imdbID !== match || ratingKey(detail.Title) !== id) throw new Error("Movie identity changed");
        const values = new Map(detail.Ratings.map(rating => [rating.Source, rating.Value]));
        movie = { imdbId: match, title: detail.Title, year: detail.Year,
          metacritic: score(values.get("Metacritic"), "/100", 100),
          rottenTomatoes: score(values.get("Rotten Tomatoes"), "%", 100),
          imdb: score(values.get("Internet Movie Database"), "/10", 10) };
      }
      cache.entries[id] = { checkedAt: instantSchema.parse(new Date(clock.now()).toISOString()), movie };
      await save();
    } catch {
      cache.retryAt = clock.now() + 60 * 60_000;
      await save();
      // Never log provider errors/URLs: they may contain the API key.
      console.warn("OMDb: stopped after an unsuccessful lookup or request limit; retained saved ratings. Check your key/quota; retry after one hour.");
      break;
    }
  }
  const ratings = result();
  console.log(`OMDb: ${requests} requests; ${Object.values(ratings).filter(entry => entry.movie).length}/${wanted.size} titles matched. Unmatched titles have no ratings.`);
  return ratings;
}
