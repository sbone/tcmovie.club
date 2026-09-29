import { Temporal } from "@js-temporal/polyfill";
import { instantSchema, timeZone } from "./domain.js";
import type { Instant } from "./domain.js";

export function chicagoTime(local: string): Instant {
  const time = Temporal.PlainDateTime.from(local, { overflow: "reject" });
  return instantSchema.parse(time.toZonedDateTime(timeZone, {
    disambiguation: "reject",
  }).toInstant().toString());
}

export function chicagoDate(instant: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

export function datesFrom(date: string, count: number): string[] {
  const start = Temporal.PlainDate.from(date);
  return Array.from({ length: count }, (_, days) => start.add({ days }).toString());
}

const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function englishDate(text: string): string {
  const match = text.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (!match) throw new Error(`Missing full calendar date: ${text}`);
  const month = months.indexOf(match[1]?.toLowerCase() ?? "") + 1;
  return Temporal.PlainDate.from({ year: Number(match[3]), month, day: Number(match[2]) }, { overflow: "reject" }).toString();
}

export function clock24(text: string): string {
  const match = text.trim().match(/^(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\.?$/i);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12) throw new Error(`Invalid clock time: ${text}`);
  const hour = Number(match[1]) % 12 + (match[3]?.toLowerCase() === "p" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${match[2] ?? "00"}:00`;
}
