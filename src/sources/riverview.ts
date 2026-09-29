import { load } from "cheerio";
import { Temporal } from "@js-temporal/polyfill";
import type { Result } from "../domain.js";
import { errorMessage, finishParse } from "../parse.js";
import type { Diagnostic, ParsedSource } from "../parse.js";
import { chicagoTime, clock24, englishDate } from "../time.js";

// Film pages omit years. Resolve only against full dated navigation from the listing.
export function parseRiverview(raw: string, details: Readonly<Record<string, string>> = {}): Result<ParsedSource, string> {
  try {
    const $ = load(raw);
    const header = $("h2").toArray().map(el => $(el).text()).find(text => text.startsWith("Now Playing -"));
    if (!header || !$(".blog-sidebar ul.playing").length) throw new Error("Missing dated Riverview schedule");
    const date = englishDate(header);
    const dates = new Set([date, ...$('a[href^="/base/index/"]').toArray()
      .map(el => $(el).attr("href")?.split("/").at(-1) ?? "").filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))]);
    const candidates: unknown[] = [];
    const diagnostics: Diagnostic[] = [];
    const add = (path: string, title: string, day: string, clock: string) => {
      const at = chicagoTime(`${day}T${clock24(clock)}`);
      candidates.push({ id: `riverview:${path}:${at}`, title, venueId: "riverview",
        start: { kind: "screening", at, doorsAt: null }, endsAt: null,
        eventUrl: new URL(path, "https://www.riverviewtheater.com").href,
        ticketUrl: null, format: null, series: null, tags: [],
        status: { kind: "scheduled", availability: "unknown" }, access: "unknown",
        sourceId: "riverview", sourceEventId: null });
    };
    $(".blog-sidebar ul.playing > li").each((index, el) => {
      const row = $(el);
      const path = row.find('a[href^="/show/show/"]').attr("href");
      const title = row.find("a").first().text().trim();
      try {
        if (!path || !title) throw new Error("Missing film link/title");
        const times = row.clone().find("a").remove().end().text().trim().split(/\s*,\s*/);
        for (const time of times) add(path, title, date, time);
        const detail = details[path];
        if (!detail) return;
        const film = load(detail);
        const showtimes = film("#listinginfo dt").filter((_, el) => film(el).text().trim() === "Showtimes:")
          .nextUntil("dt", "dd");
        if (!showtimes.length) throw new Error("Missing detail showtimes");
        showtimes.each((_, el) => {
          const line = film(el).text().trim();
          const match = line.match(/^(\w+)\s+\(([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\):\s*(.+)$/);
          if (!match) throw new Error(`Unrecognized showtime: ${line}`);
          const matches = [...dates].filter(value => {
            const day = Temporal.PlainDate.from(value);
            return day.day === Number(match[3]) && day.toLocaleString("en-US", { month: "short" }) === match[2]
              && day.toLocaleString("en-US", { weekday: "long" }) === match[1];
          });
          const resolved = matches[0];
          if (matches.length !== 1 || !resolved) throw new Error(`Date not uniquely present in dated navigation: ${line}`);
          for (const clock of (match[4] ?? "").split(/\s*,\s*/)) add(path, title, resolved, clock);
        });
      } catch (error) {
        diagnostics.push({ kind: "invalid", record: path ?? String(index), message: errorMessage(error) });
      }
    });
    if (!candidates.length && !diagnostics.length) throw new Error("Empty Riverview schedule needs review");
    return { kind: "ok", value: finishParse(candidates, diagnostics) };
  } catch (error) {
    return { kind: "err", error: errorMessage(error) };
  }
}
