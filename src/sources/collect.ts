import { load } from "cheerio";
import type { Result, SourceId } from "../domain.js";
import { instantSchema } from "../domain.js";
import { origins } from "../http.js";
import type { createHttp, Page } from "../http.js";
import { combineParsed } from "../parse.js";
import type { Diagnostic, ParsedSource } from "../parse.js";
import { chicagoDate, datesFrom, englishDate } from "../time.js";
import { parseHeights, parseHeightsCalendar } from "./heights.js";
import { parseRiverview, parseRiverviewSpecials } from "./riverview.js";
import { parseParkway } from "./parkway.js";
import { parseTrylon } from "./trylon.js";
import { parseMain } from "./main.js";

type Http = ReturnType<typeof createHttp>;

export async function collectSource(source: SourceId, http: Http, firstDate: string) {
  const pages: Page[] = [];
  const notes: Diagnostic[] = [];
  const results: Result<ParsedSource, string>[] = [];
  const dates = datesFrom(firstDate, 14);
  const lastDate = dates[13]!;
  const warn = (message: string) => notes.push({ kind: "warning", record: "coverage", message });
  const get = async (path: string, kind: "html" | "calendar" | "json" = "html") => {
    const page = await http.request(path, kind); pages.push(page); return page.body;
  };
  const links = (html: string, match: RegExp) => {
    const $ = load(html);
    return [...new Set($("a[href]").toArray().map(el => {
      const url = new URL($(el).attr("href")!, origins[source]);
      return url.origin === origins[source] && !url.username && !url.password && !url.search && match.test(url.pathname) ? url.pathname : "";
    }).filter(Boolean))];
  };
  const refresh = async (paths: string[]) => {
    const found: Record<string, string> = {};
    // Refresh missing/oldest pages first so later dates also get a turn within the budget.
    paths.sort((a, b) => (http.cached(a)?.checkedAt ?? 0) - (http.cached(b)?.checkedAt ?? 0));
    for (const path of paths) {
      const page = http.remaining() ? await http.request(path, "html") : http.cached(path);
      if (page) { found[path] = page.body; pages.push(page); }
      else warn(`Request limit: ${path} was not checked; coverage is incomplete.`);
    }
    return found;
  };
  await http.checkRobots();
  switch (source) {
    case "trylon":
      results.push(parseTrylon(await get("/feed/my-calendar-google/", "calendar")));
      warn("Calendar feed only; known coverage gaps remain unverified. No manual corrections are applied.");
      break;
    case "heights": {
      const home = await get("/");
      results.push(parseHeights(home));
      const path = links(home, /^\/calendar\/?$/)[0];
      if (!path) throw new Error("Heights calendar link missing");
      const calendar = await get(path);
      results.push(parseHeightsCalendar(calendar));
      const title = load(calendar)("title").text();
      const match = title.match(/^([A-Za-z]+) (\d{4}) \| Heights Theater$/);
      if (!match) throw new Error("Missing Heights calendar month");
      const currentMonth = englishDate(`${match[1]} 1, ${match[2]}`).slice(0, 7);
      for (const month of new Set(dates.map(date => date.slice(0, 7)))) {
        if (month === currentMonth) continue;
        const next = links(calendar, /^\/calendar\/[a-z]+\/\d{4}$/).find(path => {
          const [, , name, year] = path.split("/");
          return englishDate(`${name} 1, ${year}`).startsWith(month);
        });
        if (!next) throw new Error(`Heights calendar link missing for ${month}`);
        results.push(parseHeightsCalendar(await get(next)));
      }
      break;
    }
    case "riverview": {
      const home = await get("/");
      results.push(parseRiverview(home, {}, firstDate));
      const special = links(home, /^\/specialscreening\/?$/)[0];
      if (special) results.push(parseRiverviewSpecials(await get(special), home));
      else warn("Special Screenings link missing; specials were not checked.");
      const dated = links(home, /^\/base\/index\/\d{4}-\d{2}-\d{2}$/)
        .filter(path => path.slice(-10) > firstDate && path.slice(-10) <= lastDate).sort();
      const daily = await refresh(dated);
      for (const [path, html] of Object.entries(daily)) results.push(parseRiverview(html, {}, path.slice(-10)));
      warn(`Daily navigation extends through ${dated.at(-1)?.slice(-10) ?? firstDate}; dates without published listings are unverified.`);
      break;
    }
    case "parkway": {
      const listing = await get("/movies");
      const parsed = parseParkway(listing);
      if (parsed.kind === "err") throw new Error(parsed.error);
      const paths = [...new Set(parsed.value.screenings.filter(item => {
        const date = chicagoDate(item.start.at); return date >= firstDate && date <= lastDate;
      }).map(item => new URL(item.eventUrl).pathname))];
      const details = await refresh(paths);
      results.push(parseParkway(listing, details));
      break;
    }
    case "main": {
      const query = new URLSearchParams({ start_date: firstDate, end_date: datesFrom(firstDate, 15)[14]!, _locale: "user" });
      results.push(parseMain(await get(`/wp-json/gecko-theme/v1/calendar-events?${query}`, "json")));
      warn("Future dates without published showtimes remain unverified; events at other venues are excluded.");
      break;
    }
  }
  const result = combineParsed(results);
  return { result: result.kind === "ok" ? { kind: "ok" as const,
    value: { ...result.value, diagnostics: [...result.value.diagnostics, ...notes] } } : result,
    responseAt: instantSchema.parse(new Date(Math.min(...pages.map(page => page.responseAt))).toISOString()) };
}
