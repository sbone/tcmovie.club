import { load } from "cheerio";
import { Temporal } from "@js-temporal/polyfill";
import type { Result } from "../domain.js";
import { errorMessage, finishParse } from "../parse.js";
import type { Diagnostic, ParsedSource } from "../parse.js";
import { chicagoTime, clock24, datesFrom, englishDate } from "../time.js";

// Film pages omit years. Use dated navigation plus the preceding week for lingering past shows.
export function parseRiverview(raw: string, details: Readonly<Record<string, string>> = {}): Result<ParsedSource, string> {
  try {
    const $ = load(raw);
    const header = $("h2").toArray().map(el => $(el).text()).find(text => text.startsWith("Now Playing -"));
    if (!header || !$(".blog-sidebar ul.playing").length) throw new Error("Missing dated Riverview schedule");
    const date = englishDate(header);
    if ($('.blog-sidebar ul.playing').text().includes("there aren't any showtimes scheduled at the moment")
      && $('#posters a[href^="/show/show/"]').length === 0
      && $('.blog-sidebar ul.playing a[href^="/show/show/"]').length === 0) {
      return { kind: "ok", value: { screenings: [], diagnostics: [{ kind: "warning", record: date,
        message: "Venue explicitly has not scheduled this date" }] } };
    }
    // ponytail: bounded seven-day history; revisit if the source retains older detail showtimes.
    const past = datesFrom(Temporal.PlainDate.from(date).subtract({ days: 7 }).toString(), 7);
    const dates = new Set([...past, date, ...$('a[href^="/base/index/"]').toArray()
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

export function parseRiverviewSpecials(raw: string, context: string): Result<ParsedSource, string> {
  try {
    const $ = load(raw), home = load(context);
    const header = home("h2").toArray().map(el => home(el).text()).find(text => text.startsWith("Now Playing -"));
    if (!header || !$(".introduction h2").text().includes("Special Screenings") || !$(".event .description").length) {
      throw new Error("Missing Riverview specials or dated context");
    }
    const anchor = Temporal.PlainDate.from(englishDate(header));
    const candidates: unknown[] = [], diagnostics: Diagnostic[] = [];
    $(".event .description").each((index, element) => {
      const card = $(element), title = card.find("h3").text().trim();
      const link = card.find('a[href*="/show/show/"]').first().attr("href");
      try {
        if (!title || !link) throw new Error("Missing special film title/link");
        const url = new URL(link, "https://www.riverviewtheater.com");
        if (url.hostname !== "www.riverviewtheater.com" || !/^\/show\/show\/\d+$/.test(url.pathname)) {
          throw new Error("Unexpected special film link");
        }
        const match = card.text().match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+at\s+(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)/i);
        if (!match) {
          diagnostics.push({ kind: "warning", record: title, message: "Special screening has no explicit dated start time" });
          return;
        }
        // ponytail: yearless announcements resolve only within the prior week / next 180 days.
        const matches = [anchor.year - 1, anchor.year, anchor.year + 1]
          .flatMap(year => {
            try { return [Temporal.PlainDate.from(englishDate(`${match[2]} ${match[3]}, ${year}`))]; }
            catch { return []; } // A year candidate may lack February 29.
          })
          .filter(day => day.since(anchor).days >= -7 && day.since(anchor).days <= 180
            && day.toLocaleString("en-US", { weekday: "long" }).toLowerCase() === match[1]?.toLowerCase());
        const day = matches[0];
        if (matches.length !== 1 || !day || !match[4]) throw new Error("Special date does not resolve uniquely against dated context");
        const at = chicagoTime(`${day}T${clock24(match[4])}`);
        candidates.push({ id: `riverview:${url.pathname}:${at}`, title, venueId: "riverview",
          start: { kind: "screening", at, doorsAt: null }, endsAt: null, eventUrl: url.href,
          ticketUrl: null, format: null, series: "Special screening", tags: ["Special screening"],
          status: { kind: "scheduled", availability: "unknown" }, access: "unknown",
          sourceId: "riverview", sourceEventId: null });
      } catch (error) { diagnostics.push({ kind: "invalid", record: title || String(index), message: errorMessage(error) }); }
    });
    return { kind: "ok", value: finishParse(candidates, diagnostics) };
  } catch (error) { return { kind: "err", error: errorMessage(error) }; }
}
