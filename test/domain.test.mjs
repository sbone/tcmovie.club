import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeScreening, instantSchema, sourceScreenings, startLabel } from "../dist/domain.js";

// Synthetic domain input, not a captured venue response or a real listing.
const example = {
  id: "heights:example:2026-09-30T00:00:00.000Z",
  title: " Example Film ",
  venueId: "heights",
  start: { kind: "screening", at: "2026-09-29T19:00:00-05:00", doorsAt: null },
  endsAt: null,
  eventUrl: "https://example.org/film",
  ticketUrl: null,
  format: "35mm",
  series: null,
  tags: ["special", "special"],
  status: { kind: "scheduled", availability: "unknown" },
  access: "unknown",
  sourceId: "trylon",
  sourceEventId: null,
};

test("decode validates, normalizes, and preserves distinct source and venue", () => {
  const result = decodeScreening(example);
  assert.equal(result.kind, "ok");
  assert.equal(result.value.title, "Example Film");
  assert.equal(result.value.start.at, "2026-09-30T00:00:00.000Z");
  assert.deepEqual(result.value.tags, ["special"]);
  assert.equal(result.value.venueId, "heights");
  assert.equal(result.value.sourceId, "trylon");
  assert.ok(Object.isFrozen(result.value));
  assert.ok(Object.isFrozen(result.value.tags));
  assert.ok(Object.isFrozen(result.value.status));
});

test("decode rejects invalid external data instead of trusting a type assertion", () => {
  for (const change of [
    { title: " " },
    { venueId: "unknown-theater" },
    { start: { ...example.start, at: "2026-09-29T19:00:00" } },
    { start: { ...example.start, at: "2026-02-30T19:00:00Z" } },
    { start: { ...example.start, doorsAt: "2026-09-29T20:00:00-05:00" } },
    { eventUrl: "javascript:alert(1)" },
    { ticketUrl: "not a URL" },
    { endsAt: "2026-09-29T18:00:00-05:00" },
    { access: "everyone-probably" },
    { status: { kind: "cancelled", availability: "available" } },
    { status: { kind: "scheduled" } },
  ]) {
    const result = decodeScreening({ ...example, ...change });
    assert.equal(result.kind, "err", JSON.stringify(change));
    assert.ok(result.error.length > 0);
  }
  assert.equal(decodeScreening(null).kind, "err");
});

test("membership restrictions are explicit and unknown access stays unknown", () => {
  for (const access of ["unknown", "public", "members-only"]) {
    const result = decodeScreening({ ...example, access });
    assert.equal(result.kind, "ok");
    assert.equal(result.value.access, access);
  }
});

test("event times retain uncertainty; explicit film times can retain doors separately", () => {
  const event = decodeScreening({
    ...example, start: { kind: "event", at: example.start.at },
  });
  assert.equal(event.kind, "ok");
  assert.equal(startLabel(event.value.start), "Event starts · film time unconfirmed");
  const film = decodeScreening({
    ...example,
    start: { kind: "screening", at: "2026-09-29T20:00:00-05:00", doorsAt: example.start.at },
  });
  assert.equal(film.kind, "ok");
  assert.equal(startLabel(film.value.start), "Screening starts");
  assert.equal(film.value.start.at, "2026-09-30T01:00:00.000Z");
  assert.equal(film.value.start.doorsAt, "2026-09-30T00:00:00.000Z");
});

test("explicit offsets distinguish the two occurrences of a DST fall-back time", () => {
  assert.equal(instantSchema.parse("2026-11-01T01:30:00-05:00"), "2026-11-01T06:30:00.000Z");
  assert.equal(instantSchema.parse("2026-11-01T01:30:00-06:00"), "2026-11-01T07:30:00.000Z");
});

test("source state reader returns the supplied snapshot, including after failure", () => {
  const result = decodeScreening(example);
  assert.equal(result.kind, "ok");
  const snapshot = {
    screenings: [result.value],
    checkedAt: instantSchema.parse("2026-09-29T10:00:00Z"),
    changedAt: instantSchema.parse("2026-09-29T10:00:00Z"),
  };
  const error = { kind: "parse", at: snapshot.checkedAt, message: "Source changed" };
  assert.equal(sourceScreenings({ kind: "ready", snapshot }), snapshot.screenings);
  assert.equal(sourceScreenings({ kind: "failed", lastGood: snapshot, error }), snapshot.screenings);
  assert.deepEqual(sourceScreenings({ kind: "failed", lastGood: null, error }), []);
  assert.deepEqual(sourceScreenings({ kind: "not-checked" }), []);
});
