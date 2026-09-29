import { z } from "zod";

export const timeZone = "America/Chicago";

export type Result<Value, Error> =
  | Readonly<{ kind: "ok"; value: Value }>
  | Readonly<{ kind: "err"; error: Error }>;

export const venueIdSchema = z.enum(["trylon", "heights", "parkway", "riverview"]);
export type VenueId = z.infer<typeof venueIdSchema>;

// A source can list screenings at another venue (e.g. Trylon at Heights).
export const sourceIdSchema = z.enum(["trylon", "heights", "parkway", "riverview"]);
export type SourceId = z.infer<typeof sourceIdSchema>;

const text = z.string().trim().min(1);
export const screeningIdSchema = text.brand<"ScreeningId">();
export type ScreeningId = z.infer<typeof screeningIdSchema>;

export const httpUrlSchema = z.url({ protocol: /^https?$/ }).brand<"HttpUrl">();
export type HttpUrl = z.infer<typeof httpUrlSchema>;

// Local wall times must be resolved by the adapter before reaching the domain.
// Store a canonical UTC instant; display and group dates in America/Chicago.
export const instantSchema = z.iso.datetime({ offset: true })
  .transform(value => new Date(value).toISOString())
  .brand<"Instant">();
export type Instant = z.infer<typeof instantSchema>;

export const screeningStatusSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("scheduled"),
    availability: z.enum(["unknown", "available", "sold-out"]),
  }).readonly(),
  z.strictObject({ kind: z.literal("cancelled") }).readonly(),
]);
export type ScreeningStatus = z.infer<typeof screeningStatusSchema>;

export const screeningStartSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("screening"),
    at: instantSchema,
    doorsAt: instantSchema.nullable(),
  }).readonly(),
  z.strictObject({
    kind: z.literal("event"),
    at: instantSchema,
  }).readonly(),
]);
export type ScreeningStart = z.infer<typeof screeningStartSchema>;

export function startLabel(start: ScreeningStart): string {
  switch (start.kind) {
    case "screening": return "Screening starts";
    case "event": return "Event starts · film time unconfirmed";
    default: return start satisfies never;
  }
}

export const screeningSchema = z.strictObject({
  id: screeningIdSchema,
  title: text,
  venueId: venueIdSchema,
  start: screeningStartSchema,
  endsAt: instantSchema.nullable(),
  eventUrl: httpUrlSchema,
  ticketUrl: httpUrlSchema.nullable(),
  format: text.nullable(),
  series: text.nullable(),
  tags: z.array(text).transform(tags => [...new Set(tags)]).readonly(),
  status: screeningStatusSchema,
  sourceId: sourceIdSchema,
  sourceEventId: text.nullable(),
  firstSeenAt: instantSchema,
  lastSeenAt: instantSchema,
}).refine(value => value.endsAt === null || value.endsAt > value.start.at, {
  path: ["endsAt"], message: "End must be after start",
}).refine(value => value.start.kind !== "screening"
  || value.start.doorsAt === null || value.start.doorsAt <= value.start.at, {
  path: ["start", "doorsAt"], message: "Doors must not be after the screening start",
}).refine(value => value.lastSeenAt >= value.firstSeenAt, {
  path: ["lastSeenAt"], message: "Last seen must not precede first seen",
}).readonly();
export type Screening = z.infer<typeof screeningSchema>;

export type DecodeIssue = Readonly<{ path: string; message: string }>;

export function decodeScreening(input: unknown): Result<Screening, readonly DecodeIssue[]> {
  const result = screeningSchema.safeParse(input);
  return result.success
    ? { kind: "ok", value: result.data }
    : {
      kind: "err",
      error: result.error.issues.map(issue => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    };
}

export type SourceSnapshot = Readonly<{
  screenings: readonly Screening[];
  checkedAt: Instant; // Last accepted check, including a valid unchanged response.
  changedAt: Instant; // Changes to screening content, excluding bookkeeping dates.
}>;

export type IngestError = Readonly<{
  kind: "access" | "network" | "parse" | "validation" | "anomaly";
  at: Instant;
  message: string;
}>;

// Staleness is derived from time and failures, not a competing mutable flag.
export type SourceState =
  | Readonly<{ kind: "not-checked" }>
  | Readonly<{ kind: "ready"; snapshot: SourceSnapshot }>
  | Readonly<{ kind: "failed"; lastGood: SourceSnapshot | null; error: IngestError }>;

export function sourceScreenings(state: SourceState): readonly Screening[] {
  switch (state.kind) {
    case "not-checked": return [];
    case "ready": return state.snapshot.screenings;
    case "failed": return state.lastGood?.screenings ?? [];
    default: return state satisfies never;
  }
}
