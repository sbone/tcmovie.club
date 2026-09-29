import { load } from "cheerio";
import type { Result, ScreeningStart } from "../domain.js";
import { errorMessage, finishParse } from "../parse.js";
import type { Diagnostic, ParsedSource } from "../parse.js";
import { chicagoTime, clock24, englishDate } from "../time.js";

export function parseParkway(raw: string, details: Readonly<Record<string, string>> = {}): Result<ParsedSource, string> {
  const $ = load(raw);
  const items = $(".summary-item");
  if (!items.length) return { kind: "err", error: "Missing Parkway movie listings" };
  const candidates: unknown[] = [];
  const diagnostics: Diagnostic[] = [];
  items.each((index, el) => {
    const item = $(el);
    const path = item.find(".summary-title-link").attr("href");
    const title = item.find(".summary-title-link").text().trim();
    const record = path ?? String(index);
    try {
      if (!path?.startsWith("/all-events/") || !title) throw new Error("Missing event title/link");
      if (/\b(?:all.movie|series) pass\b/i.test(title)) {
        diagnostics.push({ kind: "excluded", record, message: "Multi-event pass, not a screening" });
        return;
      }
      const date = englishDate(item.find(".summary-metadata-item--date").first().text());
      const clock = item.find(".event-time-12hr").first().text().split(/[–—]/)[0] ?? "";
      const at = chicagoTime(`${date}T${clock24(clock)}`);
      let start: ScreeningStart = { kind: "event", at };
      const detail = details[path];
      if (detail) {
        const page = load(detail);
        page("br").replaceWith(" ");
        if (page("time.event-date").first().attr("datetime") !== date) throw new Error("Detail date disagrees with listing");
        const paragraphs = page(".eventitem-column-content p").toArray().map(el => page(el).text()).join("\n");
        const movie = [...paragraphs.matchAll(/\b(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)\s+(?:Movie|Film|Screening)\b/gi)];
        const doors = [...paragraphs.matchAll(/\b(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)\s+Doors\b/gi)];
        if (movie.length === 1 && movie[0]?.[1]) {
          start = { kind: "screening", at: chicagoTime(`${date}T${clock24(movie[0][1])}`),
            doorsAt: doors.length === 1 && doors[0]?.[1] ? chicagoTime(`${date}T${clock24(doors[0][1])}`) : null };
        }
      }
      if (start.kind === "event") diagnostics.push({ kind: "warning", record, message: "Film time unconfirmed; showing event start" });
      candidates.push({ id: `parkway:${path}:${date}`, title, venueId: "parkway", start,
        endsAt: null, eventUrl: new URL(path, "https://theparkwaytheater.com").href,
        ticketUrl: null, format: title.match(/\b(35mm|70mm|DCP|4K)\b/i)?.[1] ?? null,
        series: null, tags: [], status: { kind: "scheduled", availability: /sold[ -]?out/i.test(title) ? "sold-out" : "unknown" },
        access: /members[ -]?only/i.test(title) ? "members-only" : "unknown",
        sourceId: "parkway", sourceEventId: path,
      });
    } catch (error) {
      diagnostics.push({ kind: "invalid", record, message: errorMessage(error) });
    }
  });
  return { kind: "ok", value: finishParse(candidates, diagnostics) };
}
