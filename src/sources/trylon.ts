import ICAL from "ical.js";
import { instantSchema, timeZone } from "../domain.js";
import type { Result } from "../domain.js";
import { finishParse, errorMessage } from "../parse.js";
import type { Diagnostic, ParsedSource } from "../parse.js";
import { chicagoTime } from "../time.js";

export function parseTrylon(raw: string): Result<ParsedSource, string> {
  try {
    if (!raw.trimEnd().endsWith("END:VCALENDAR")) throw new Error("Incomplete calendar");
    const calendar = ICAL.Component.fromString(raw);
    if (calendar.name !== "vcalendar") throw new Error("Expected VCALENDAR");
    const events = calendar.getAllSubcomponents("vevent");
    if (events.length === 0) throw new Error("No events in calendar; review before replacing data");
    const candidates: unknown[] = [];
    const diagnostics: Diagnostic[] = [{ kind: "warning", record: "calendar",
      message: "End times omitted: captured Trylon feed uses placeholder one-hour durations" }];

    for (const [index, event] of events.entries()) {
      let record = String(index);
      try {
        const text = (name: string): string => {
          const value = event.getFirstPropertyValue(name);
          if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${name}`);
          return value.trim();
        };
        record = text("uid");
        const title = text("summary");
        if (/\bticket event\b/i.test(title)) {
          diagnostics.push({ kind: "excluded", record, message: "Ticket-sale event, not a screening" });
          continue;
        }
        // ponytail: this feed supplies occurrences; add recurrence expansion only if it changes.
        if (["rrule", "rdate", "exdate", "recurrence-id"].some(key => event.hasProperty(key))) {
          throw new Error("Recurring event needs explicit expansion support");
        }
        const location = text("location");
        const venueId = location.startsWith("The Trylon Cinema ") ? "trylon"
          : location.startsWith("The Heights Theater ") ? "heights" : null;
        if (!venueId) throw new Error(`Unknown venue: ${location}`);
        const property = event.getFirstProperty("dtstart");
        const start: unknown = property?.toJSON()[3];
        if (typeof start !== "string" || !start.includes("T")) throw new Error("Missing timed DTSTART");
        const at = start.endsWith("Z") ? instantSchema.parse(start)
          : property?.getParameter("tzid") === timeZone ? chicagoTime(start)
            : (() => { throw new Error("Expected America/Chicago timezone"); })();
        const categories = event.getAllProperties("categories")
          .flatMap(value => value.getValues()).filter((value): value is string => typeof value === "string")
          .map(value => value.trim()).filter(value => value && value !== "General");
        const format = title.match(/\b(35mm|70mm|DCP|4K)\b/i)?.[1] ?? null;
        const status = event.getFirstPropertyValue("status");
        if (status && status !== "CONFIRMED" && status !== "CANCELLED") {
          throw new Error(`Unsupported event status: ${String(status)}`);
        }
        candidates.push({
          id: `trylon:${record}`, title, venueId,
          start: { kind: "screening", at, doorsAt: null }, endsAt: null,
          eventUrl: text("url"), ticketUrl: null, format,
          series: categories.length ? categories.join(" · ") : null, tags: categories,
          status: status === "CANCELLED" ? { kind: "cancelled" }
            : { kind: "scheduled", availability: /sold[ -]?out/i.test(title) ? "sold-out" : "unknown" },
          access: /\bTrylon Club\b|members[ -]?only/i.test(title) ? "members-only" : "unknown",
          sourceId: "trylon", sourceEventId: record,
        });
      } catch (error) {
        diagnostics.push({ kind: "invalid", record, message: errorMessage(error) });
      }
    }
    return { kind: "ok", value: finishParse(candidates, diagnostics) };
  } catch (error) {
    return { kind: "err", error: errorMessage(error) };
  }
}
