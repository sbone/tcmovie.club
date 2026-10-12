import { load } from "cheerio";
import type { Result } from "../domain.js";
import type { Diagnostic, ParsedSource } from "../parse.js";
import { errorMessage, finishParse } from "../parse.js";
import { chicagoTime, clock24 } from "../time.js";

export type MannVenue = "grandview" | "highland";
const slug = { grandview: "grandview-1-2", highland: "highland-1-2" } as const;

// The date picker is server-rendered (sometimes in a deferred Suspense fragment).
// Its buttons are ordered by relative day offset, starting with Today.
export function mannDays(raw: string): number[] {
  const $ = load(raw);
  return $('[class*="ContextPickers_dayStrip"] button').toArray()
    .map((element, index) => ({ element, index }))
    .filter(({ element, index }) => index < 14 && !$(element).is("[disabled]") && !$(element).attr("class")?.includes("dayMore"))
    .map(({ index }) => index);
}

export function parseMann(raw: string, venue: MannVenue, expectedDate: string): Result<ParsedSource, string> {
  try {
    const $ = load(raw);
    const title = $("title").first().text();
    const name = venue === "grandview" ? "Grandview 1 & 2" : "Highland 1 & 2";
    if (!title.includes(name)) throw new Error(`Unexpected Mann theater: ${title}`);
    const context = $('[class*="StickyContext_text"]').first().text().trim();
    const date = new Date(`${expectedDate}T12:00:00Z`);
    const expectedLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC", weekday: "long", month: "short", day: "numeric",
    }).format(date);
    if (!context.includes(expectedLabel)) throw new Error(`Mann date mismatch: expected ${expectedLabel}, received ${context}`);
    const cards = $('section[aria-label="Now playing"]');
    if (cards.length !== 1) throw new Error("Missing Mann Now playing section");
    const candidates: unknown[] = [];
    const diagnostics: Diagnostic[] = [];
    cards.find("article").each((index, element) => {
      const card = $(element);
      const title = card.find("h3").first().text().trim();
      const eventPath = card.find('h3').first().closest("a").attr("href");
      if (!title || !eventPath || !eventPath.startsWith("/movies/")) {
        diagnostics.push({ kind: "invalid", record: String(index), message: "Missing movie title/link" });
        return;
      }
      const showtimes = card.find('a[href^="/booking/"]');
      if (!showtimes.length) diagnostics.push({ kind: "invalid", record: title, message: "Movie card has no booking times" });
      showtimes.each((_, element) => {
        const link = $(element);
        const path = link.attr("href") ?? "";
        const id = path.match(/^\/booking\/([\w-]+)\?/)?.[1];
        const time = link.clone().find("span").remove().end().text().trim();
        try {
          if (!id) throw new Error("Missing stable booking ID");
          const url = new URL(path, "https://www.manntheatres.com");
          if (url.searchParams.get("theatre") !== slug[venue]) throw new Error("Wrong theater on booking link");
          const at = chicagoTime(`${expectedDate}T${clock24(time)}`);
          candidates.push({
            id: `${venue}:${id}`, title, venueId: venue,
            start: { kind: "screening", at, doorsAt: null }, endsAt: null,
            eventUrl: new URL(eventPath, "https://www.manntheatres.com").href,
            ticketUrl: url.href, format: null, series: null, tags: [],
            status: { kind: "scheduled", availability: "unknown" }, access: "unknown",
            sourceId: venue, sourceEventId: id,
          });
        } catch (error) {
          diagnostics.push({ kind: "invalid", record: path, message: errorMessage(error) });
        }
      });
    });
    if (!candidates.length) diagnostics.push({ kind: "warning", record: expectedDate, message: "No published bookable showtimes for this date" });
    return { kind: "ok", value: finishParse(candidates, diagnostics) };
  } catch (error) {
    return { kind: "err", error: errorMessage(error) };
  }
}
