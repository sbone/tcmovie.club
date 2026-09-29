import { load } from "cheerio";
import type { Result } from "../domain.js";
import { errorMessage, finishParse } from "../parse.js";
import type { Diagnostic, ParsedSource } from "../parse.js";
import { chicagoTime, clock24, englishDate } from "../time.js";

export function parseHeights(raw: string): Result<ParsedSource, string> {
  const $ = load(raw);
  const cards = $(".featured");
  if (!cards.length || !$(".showtime time[datetime]").length) return { kind: "err", error: "Missing Heights listings/showtimes" };
  const candidates: unknown[] = [];
  const diagnostics: Diagnostic[] = [];
  cards.each((index, element) => {
    const card = $(element);
    const path = card.find("a.featured-img-link").attr("href");
    if (path?.startsWith("/series-and-festivals/")) {
      diagnostics.push({ kind: "excluded", record: path, message: "Series/pass card; use individual film cards" });
      return;
    }
    const title = card.find(".featured-title h2").text().trim();
    const shows = card.find(".showtime");
    if (!path?.startsWith("/films-and-events/") || !title || !shows.length) {
      diagnostics.push({ kind: "invalid", record: String(index), message: "Missing film link, title, or showtimes" });
      return;
    }
    shows.each((_, row) => {
      const show = $(row);
      let record = `${path}:${index}`;
      try {
        const local = show.find("time[datetime]").first().attr("datetime");
        if (!local) throw new Error("Missing time");
        const at = chicagoTime(local.replace(" ", "T"));
        const ticketPath = show.find('a[href^="/order/add-tickets/"]').first().attr("href");
        const sourceEventId = ticketPath?.match(/^\/order\/add-tickets\/(\d+)(?:\/|$)/)?.[1];
        if (!sourceEventId) throw new Error("Missing stable showtime ID");
        record = sourceEventId;
        const format = show.find('.format-and-tix-link a[href="#"]').text().trim() || null;
        const series = show.find('a[href^="/series-and-festivals/"]').first().text().trim() || null;
        candidates.push({
          id: `heights:${record}`, title, venueId: "heights",
          start: { kind: "screening", at, doorsAt: null }, endsAt: null,
          eventUrl: new URL(path, "https://www.heightstheater.com").href,
          ticketUrl: null, format, series, tags: series ? [series] : [],
          status: { kind: "scheduled", availability: /sold[ -]?out/i.test(show.text()) ? "sold-out" : "unknown" },
          access: /members[ -]?only/i.test(title) ? "members-only" : "unknown",
          sourceId: "heights", sourceEventId,
        });
      } catch (error) {
        diagnostics.push({ kind: "invalid", record, message: errorMessage(error) });
      }
    });
  });
  return { kind: "ok", value: finishParse(candidates, diagnostics) };
}

export function parseHeightsCalendar(raw: string): Result<ParsedSource, string> {
  const $ = load(raw);
  const month = $("title").text().match(/^([A-Za-z]+) (\d{4}) \| Heights Theater$/);
  if (!month || !$(".calendar-cell[id^=day]").length || !$(".calendar-listing").length) {
    return { kind: "err", error: "Missing dated Heights calendar listings" };
  }
  const candidates: unknown[] = [];
  const diagnostics: Diagnostic[] = [];
  $(".calendar-cell[id^=day] .calendar-listing").each((index, element) => {
    const card = $(element);
    const path = card.find('h3 a[href^="/films-and-events/"]').attr("href");
    const title = card.find("h3 a").text().trim();
    const series = card.find('a[href^="/series-and-festivals/"]').first().text().trim() || null;
    const shows = card.find(".times li");
    if (!path || !title || !shows.length) {
      diagnostics.push({ kind: "invalid", record: String(index), message: "Missing calendar film link/title/showtimes" });
      return;
    }
    shows.each((_, element) => {
      const row = $(element);
      let record = `${path}:${index}`;
      try {
        const day = card.closest(".calendar-cell").attr("id")?.replace(/^day/, "");
        const date = englishDate(`${month[1]} ${day}, ${month[2]}`);
        const ticket = row.find('a[href^="/order/add-tickets/"]').first();
        const sourceEventId = ticket.attr("href")?.match(/^\/order\/add-tickets\/(\d+)(?:\/|$)/)?.[1];
        if (!sourceEventId) throw new Error("Missing stable calendar showtime ID");
        record = sourceEventId;
        candidates.push({ id: `heights:${record}`, title, venueId: "heights",
          start: { kind: "screening", at: chicagoTime(`${date}T${clock24(ticket.text())}`), doorsAt: null }, endsAt: null,
          eventUrl: new URL(path, "https://www.heightstheater.com").href,
          ticketUrl: null, format: row.find(".film-format").text().trim() || null,
          series, tags: series ? [series] : [],
          status: { kind: "scheduled", availability: /sold[ -]?out/i.test(row.text()) ? "sold-out" : "unknown" },
          access: /members[ -]?only/i.test(title) ? "members-only" : "unknown",
          sourceId: "heights", sourceEventId,
        });
      } catch (error) { diagnostics.push({ kind: "invalid", record, message: errorMessage(error) }); }
    });
  });
  return { kind: "ok", value: finishParse(candidates, diagnostics) };
}
