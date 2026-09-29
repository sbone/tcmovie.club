import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseTrylon } from "../dist/sources/trylon.js";
import { instantSchema, sourceScreenings } from "../dist/domain.js";
import { emptySource, acceptSource, readSource, writeSource } from "../dist/store.js";
import { dedupe } from "../dist/dedupe.js";

const result = parseTrylon(await readFile(new URL("./fixtures/trylon/calendar.ics", import.meta.url), "utf8"));
assert.equal(result.kind, "ok");
const first = instantSchema.parse("2026-09-29T11:16:22Z");
const later = instantSchema.parse("2026-09-30T11:16:22Z");

test("success, unchanged check, failure, and recovery preserve data and correct timestamps", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-store-"));
  try {
    const good = acceptSource(emptySource(), "trylon", result, first);
    assert.equal(good.state.kind, "ready");
    await writeSource(directory, "trylon", good);
    const loaded = await readSource(directory, "trylon");
    assert.deepEqual(loaded, good);
    const unchanged = acceptSource(loaded, "trylon", result, later);
    assert.equal(unchanged.state.snapshot.checkedAt, later);
    assert.equal(unchanged.state.snapshot.changedAt, first);
    const id = result.value.screenings[0].id;
    assert.deepEqual(unchanged.observations[id], { firstSeenAt: first, lastSeenAt: later });
    const broken = acceptSource(unchanged, "trylon", { kind: "err", error: "Markup changed" }, later);
    await writeSource(directory, "trylon", broken);
    const restored = await readSource(directory, "trylon");
    assert.equal(restored.state.kind, "failed");
    assert.deepEqual(sourceScreenings(restored.state), good.state.snapshot.screenings);
    const changed = { kind: "ok", value: { ...result.value, screenings: result.value.screenings.map((item, i) => i ? item : { ...item, title: "Updated title" }) } };
    const recovered = acceptSource(restored, "trylon", changed, later);
    assert.equal(recovered.state.kind, "ready");
    assert.equal(recovered.state.snapshot.changedAt, later);
    assert.equal(recovered.observations[id].firstSeenAt, first);
    await writeFile(join(directory, "trylon.json"), "broken JSON");
    await assert.rejects(readSource(directory, "trylon"));
    assert.equal(await readFile(join(directory, "trylon.json"), "utf8"), "broken JSON");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("invalid records, old captures, and disappearing future schedules do not replace good data", () => {
  const good = acceptSource(emptySource(), "trylon", result, first);
  for (const candidate of [
    { kind: "ok", value: { screenings: [], diagnostics: [] } },
    { kind: "ok", value: { screenings: result.value.screenings.slice(0, 5), diagnostics: [] } },
    { kind: "ok", value: { ...result.value, diagnostics: [{ kind: "invalid", record: "x", message: "Bad start" }] } },
  ]) {
    const failed = acceptSource(good, "trylon", candidate, later);
    assert.equal(failed.state.kind, "failed");
    assert.equal(failed.state.lastGood, good.state.snapshot);
  }
  assert.equal(acceptSource(good, "trylon", result, instantSchema.parse("2026-09-28T00:00:00Z")).state.kind, "failed");
});

test("cross-source deduplication prefers the venue while preserving membership restrictions", () => {
  const source = result.value.screenings.find(item => item.venueId === "heights");
  const restricted = { ...source, access: "members-only" };
  const venue = { ...source, id: "heights:example", sourceId: "heights", eventUrl: "https://www.heightstheater.com/example" };
  const otherTime = { ...venue, id: "heights:later", start: { ...venue.start, at: "2026-10-10T18:00:00.000Z" } };
  const otherVenue = { ...venue, id: "parkway:example", sourceId: "parkway", venueId: "parkway" };
  for (const pair of [[restricted, venue], [venue, restricted]]) {
    const combined = dedupe([...pair, otherTime, otherVenue]);
    assert.equal(combined.length, 3);
    const merged = combined.find(item => item.id === venue.id);
    assert.equal(merged.sourceId, "heights");
    assert.equal(merged.access, "members-only");
  }
});
