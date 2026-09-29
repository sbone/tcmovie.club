import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import robotsModule from "robots-parser";
import { z } from "zod";
import type { SourceId } from "./domain.js";
import { chicagoDate } from "./time.js";
import { writeJson } from "./store.js";
import { errorMessage } from "./parse.js";

export const origins = {
  trylon: "https://www.trylon.org", heights: "https://www.heightstheater.com",
  riverview: "https://www.riverviewtheater.com", parkway: "https://theparkwaytheater.com",
} as const;
export const dayMs = 86_400_000;
// The package exports a CJS function but declares an ESM default export.
const robotsParser = robotsModule as unknown as typeof robotsModule.default;
const pageSchema = z.object({ body: z.string(), checkedAt: z.number().finite(), responseAt: z.number().finite(),
  etag: z.string().nullable(), modified: z.string().nullable() });
const httpSchema = z.object({
  day: z.string().default(""), requestsToday: z.number().int().nonnegative().default(0),
  slot: z.string().default(""), lastRequestAt: z.number().finite().default(0),
  nextAttemptAt: z.number().finite().default(0), failures: z.number().int().nonnegative().default(0),
  paused: z.string().nullable().default(null), pages: z.record(z.string(), pageSchema).default({}),
});
export type HttpState = z.infer<typeof httpSchema>;
export type Page = z.infer<typeof pageSchema>;
export type Runtime = { now: () => number; fetch: typeof fetch; sleep: (ms: number) => Promise<unknown> };
export const runtime: Runtime = { now: Date.now, fetch: globalThis.fetch, sleep };

export async function readHttp(directory: string, source: SourceId): Promise<HttpState> {
  try { return httpSchema.parse(JSON.parse(await readFile(join(directory, `${source}.json`), "utf8"))); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return httpSchema.parse({});
    throw error;
  }
}

export function userAgent(contact: string): string {
  if (!/^[\x21-\x7e]+$/.test(contact) || /[()]/.test(contact)) throw new Error("Set TC_CONTACT to a public HTTPS project URL or contact email");
  if (contact.startsWith("https://")) {
    const url = new URL(contact);
    if (!url.hostname || url.username || url.password) throw new Error("Invalid project URL");
  } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) throw new Error("Invalid contact email");
  return `tc-movie-cal/0.1 (+${contact.startsWith("https://") ? contact : `mailto:${contact}`})`;
}

export class CollectionError extends Error {
  constructor(message: string, readonly kind: "access" | "network" = "network", readonly retryAt = 0) { super(message); }
}

// Only public schedule routes, including when an upstream sends a redirect.
function allowedPath(source: SourceId, url: URL): boolean {
  if (url.origin !== origins[source] || url.username || url.password || url.search) return false;
  if (url.pathname === "/robots.txt") return true;
  switch (source) {
    case "trylon": return url.pathname === "/feed/my-calendar-google/";
    case "heights": return /^\/(?:calendar(?:\/[a-z]+\/\d{4})?\/?)?$/.test(url.pathname);
    case "riverview": return /^\/(?:specialscreening\/?|base\/index\/\d{4}-\d{2}-\d{2})?$/.test(url.pathname);
    case "parkway": return /^\/(?:movies\/?|all-events\/[^/]+\/?)$/.test(url.pathname);
  }
}

export function createHttp(source: SourceId, agent: string, state: HttpState,
  save: () => Promise<void>, clock: Runtime = runtime) {
  let count = 0;
  let robots: ReturnType<typeof robotsParser> | undefined;
  const origin = origins[source];
  const remaining = () => Math.max(0, Math.min(6 - count, 12 - state.requestsToday));
  const cached = (path: string): Page | undefined => {
    const page = state.pages[new URL(path, origin).href];
    return page && clock.now() - page.checkedAt < dayMs ? page : undefined;
  };
  const request = async (path: string, kind: "html" | "calendar" | "robots", redirects = 0): Promise<Page> => {
    const url = new URL(path, origin);
    if (!allowedPath(source, url)) throw new CollectionError(`Unapproved schedule URL: ${url.href}`, "access");
    if (kind !== "robots" && robots?.isAllowed(url.href, agent) !== true) {
      throw new CollectionError(`robots.txt does not allow ${url.pathname}`, "access");
    }
    const today = chicagoDate(new Date(clock.now()).toISOString());
    if (state.day !== today) { state.day = today; state.requestsToday = 0; }
    if (!remaining()) throw new CollectionError("Source request budget exhausted");
    const delay = Math.max(10_000, (robots?.getCrawlDelay(agent) ?? 0) * 1000);
    const wait = state.lastRequestAt + delay - clock.now();
    if (!Number.isFinite(delay)) throw new CollectionError("Invalid robots crawl delay", "access");
    if (wait > 60_000) throw new CollectionError("Waiting for source crawl delay", "network", state.lastRequestAt + delay);
    if (wait > 0) await clock.sleep(wait);
    const previous = state.pages[url.href];
    const headers: Record<string, string> = { "User-Agent": agent, Accept: kind === "calendar" ? "text/calendar" : kind === "robots" ? "text/plain" : "text/html" };
    if (previous?.etag) headers["If-None-Match"] = previous.etag;
    if (previous?.modified) headers["If-Modified-Since"] = previous.modified;
    count++; state.requestsToday++; state.lastRequestAt = clock.now();
    await save(); // Count attempts even if the process dies during a request.
    const response = await clock.fetch(url.href, { headers, redirect: "manual", signal: AbortSignal.timeout(20_000) })
      .catch(error => { throw new CollectionError(errorMessage(error)); });
    try {
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (kind === "robots" || !location || redirects >= 2) throw new CollectionError("Redirect requires source review", "access");
        await response.body?.cancel();
        return await request(new URL(location, url).href, kind, redirects + 1);
      }
      if (response.status === 401 || response.status === 403) throw new CollectionError(`HTTP ${response.status} at ${url.pathname}; source paused for review`, "access");
      if (response.status === 429 || response.status === 503) {
        const retry = response.headers.get("retry-after") ?? "";
        const retryAt = /^\d+$/.test(retry) ? clock.now() + Number(retry) * 1000 : Date.parse(retry);
        throw new CollectionError(`HTTP ${response.status} at ${url.pathname}`, "network", Number.isFinite(retryAt) ? retryAt : 0);
      }
      if (response.status !== 200 && response.status !== 304) throw new CollectionError(`HTTP ${response.status} at ${url.pathname}`, kind === "robots" && response.status < 500 ? "access" : "network");
      const checkedAt = clock.now();
      const date = Date.parse(response.headers.get("date") ?? "");
      const age = Number(response.headers.get("age") ?? 0);
      const responseAt = Math.min(checkedAt - (Number.isFinite(age) && age > 0 ? age * 1000 : 0), Number.isFinite(date) ? date : checkedAt);
      let body: string;
      if (response.status === 304) {
        if (!previous) throw new CollectionError("304 without a saved response");
        body = previous.body;
      } else {
        const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
        const types = kind === "html" ? ["text/html", "application/xhtml+xml"] : kind === "calendar" ? ["text/calendar"] : ["text/plain"];
        if (!type || !types.includes(type)) throw new CollectionError(`Unexpected content type at ${url.pathname}: ${type}`, kind === "robots" ? "access" : "network");
        const limit = kind === "robots" ? 512_000 : 2_000_000;
        if (Number(response.headers.get("content-length")) > limit) throw new CollectionError("Response too large");
        const reader = response.body?.getReader();
        if (!reader) throw new CollectionError("Missing response body");
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.byteLength;
            if (size > limit) throw new CollectionError("Response too large");
            chunks.push(next.value);
          }
        } finally { await reader.cancel(); reader.releaseLock(); }
        body = Buffer.concat(chunks).toString("utf8");
      }
      const page = { body, checkedAt, responseAt,
        etag: response.headers.get("etag") ?? (response.status === 304 ? previous?.etag ?? null : null),
        modified: response.headers.get("last-modified") ?? (response.status === 304 ? previous?.modified ?? null : null) };
      state.pages[url.href] = page;
      await save();
      return page;
    } finally { if (!response.body?.locked) await response.body?.cancel(); }
  };
  return {
    remaining, cached, request,
    async checkRobots() {
      const previous = cached("/robots.txt");
      const page = previous && chicagoDate(new Date(previous.checkedAt).toISOString()) === chicagoDate(new Date(clock.now()).toISOString())
        ? previous : await request("/robots.txt", "robots");
      if (/<(?:!doctype|html)\b/i.test(page.body) || page.body.split(/\r?\n/).some(line => {
        const text = line.replace(/#.*/, "").trim();
        return text && !/^[\w-]+\s*:/.test(text);
      })) throw new CollectionError("Unreadable robots.txt", "access");
      robots = robotsParser(`${origin}/robots.txt`, page.body);
    },
  };
}

export const saveHttp = (directory: string, source: SourceId, state: HttpState) => writeJson(directory, `${source}.json`, state);
