import { z } from "zod";
import type { Result } from "../domain.js";
import { finishParse } from "../parse.js";
import type { Diagnostic, ParsedSource } from "../parse.js";
import { chicagoTime, clock24 } from "../time.js";

const calendar = z.object({ events: z.array(z.object({
  date: z.iso.date(), title: z.string(),
  permalink: z.string().regex(/^https:\/\/mspfilm\.org\/show\/[^/?#]+\/?$/),
  events: z.array(z.object({
    event_id: z.number().int(), start_time: z.string(), venue: z.string(), format: z.string().optional(),
  })),
})) });

export function parseMain(raw: string): Result<ParsedSource, string> {
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return { kind: "err", error: "Invalid Main calendar JSON" }; }
  const decoded = calendar.safeParse(input);
  if (!decoded.success || !decoded.data.events.length) return { kind: "err", error: "Missing Main calendar events" };
  const candidates: unknown[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const group of decoded.data.events) for (const event of group.events) {
    if (!/^Theater [1-5]$/.test(event.venue) || /^Book Launch:/i.test(group.title)) {
      diagnostics.push({ kind: "excluded", record: String(event.event_id), message: `Not a Main Cinema film screening: ${event.venue}` });
      continue;
    }
    try {
      candidates.push({ id: `main:${event.event_id}`, title: group.title, venueId: "main",
        // The API's UTC start can encode a local wall clock; its displayed time is authoritative.
        start: { kind: "screening", at: chicagoTime(`${group.date}T${clock24(event.start_time)}`), doorsAt: null },
        endsAt: null, eventUrl: group.permalink, ticketUrl: null,
        format: event.format?.trim() || null, series: null, tags: [],
        status: { kind: "scheduled", availability: "unknown" },
        access: /members[ -]?only/i.test(group.title) ? "members-only" : "unknown",
        sourceId: "main", sourceEventId: String(event.event_id),
      });
    } catch (error) {
      diagnostics.push({ kind: "invalid", record: String(event.event_id), message: String(error) });
    }
  }
  return { kind: "ok", value: finishParse(candidates, diagnostics) };
}
