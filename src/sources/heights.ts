import { load } from "cheerio";
import type { Result } from "../domain.js";
import { errorMessage, finishParse } from "../parse.js";
import type { Diagnostic, ParsedSource } from "../parse.js";
import { chicagoTime } from "../time.js";

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
