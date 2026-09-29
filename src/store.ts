import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { instantSchema, sourceStateSchema } from "./domain.js";
import type { IngestError, Instant, Result, Screening, SourceId, SourceState } from "./domain.js";
import type { ParsedSource } from "./parse.js";

const observationSchema = z.strictObject({ firstSeenAt: instantSchema, lastSeenAt: instantSchema }).readonly();
const storedSchema = z.strictObject({
  version: z.literal(1), state: sourceStateSchema,
  observations: z.record(z.string(), observationSchema),
});
export type StoredSource = z.infer<typeof storedSchema>;

export function emptySource(): StoredSource {
  return { version: 1, state: { kind: "not-checked" }, observations: {} };
}

export function lastGood(state: SourceState) {
  return state.kind === "ready" ? state.snapshot : state.kind === "failed" ? state.lastGood : null;
}

export function failed(previous: StoredSource, error: IngestError): StoredSource {
  return { ...previous, state: { kind: "failed", lastGood: lastGood(previous.state), error } };
}

const content = (records: readonly Screening[]) => JSON.stringify([...records]
  .sort((a, b) => a.id.localeCompare(b.id)).map(item => ({ ...item, tags: [...item.tags].sort() })));

export function acceptSource(previous: StoredSource, sourceId: SourceId, result: Result<ParsedSource, string>, at: Instant): StoredSource {
  const reject = (kind: IngestError["kind"], message: string) => failed(previous, { kind, message, at });
  if (result.kind === "err") return reject("parse", result.error);
  const invalid = result.value.diagnostics.filter(note => note.kind === "invalid");
  if (invalid.length) return reject("validation", invalid.map(note => `${note.record}: ${note.message}`).join("; "));
  const records = result.value.screenings;
  if (records.some(item => item.sourceId !== sourceId) || new Set(records.map(item => item.id)).size !== records.length) {
    return reject("validation", "Unexpected source or duplicate IDs");
  }
  const old = lastGood(previous.state);
  if (old && at < old.checkedAt) return reject("validation", "Refusing an older source capture");
  const oldFuture = old?.screenings.filter(item => item.start.at >= at).length ?? 0;
  const newFuture = records.filter(item => item.start.at >= at).length;
  if (!records.length || (oldFuture >= 5 && newFuture < oldFuture / 2)) {
    return reject("anomaly", "Empty schedule or major drop in future screenings; review required");
  }
  const changedAt = old && content(old.screenings) === content(records) ? old.changedAt : at;
  const observations = Object.fromEntries(records.map(item => [item.id, {
    firstSeenAt: previous.observations[item.id]?.firstSeenAt ?? at, lastSeenAt: at,
  }]));
  return { version: 1, state: { kind: "ready", snapshot: { screenings: records, checkedAt: at, changedAt } }, observations };
}

export async function readSource(directory: string, sourceId: SourceId): Promise<StoredSource> {
  let raw: string;
  try { raw = await readFile(join(directory, `${sourceId}.json`), "utf8"); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return emptySource();
    throw error;
  }
  return storedSchema.parse(JSON.parse(raw));
}

export async function writeSource(directory: string, sourceId: SourceId, value: StoredSource): Promise<void> {
  // ponytail: one writer for the offline CLI; add locking only with concurrent ingestion.
  const validated = storedSchema.parse(value);
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.${sourceId}-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { flag: "wx" });
    await rename(temporary, join(directory, `${sourceId}.json`));
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}
