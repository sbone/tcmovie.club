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
