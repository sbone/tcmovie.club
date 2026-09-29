import { mkdir, rmdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Temporal } from "@js-temporal/polyfill";
import { instantSchema, sourceIdSchema, sourceScreenings, timeZone } from "./domain.js";
import { dedupe } from "./dedupe.js";
import { CollectionError, createHttp, dayMs, readHttp, runtime, saveHttp, userAgent } from "./http.js";
import type { Runtime } from "./http.js";
import { errorMessage } from "./parse.js";
import { collectSource } from "./sources/collect.js";
import { acceptSource, failed, lastGood, readSource, writeSource } from "./store.js";
import { writeSite } from "./site.js";
import type { SourceInfo } from "./site.js";
import { datesFrom } from "./time.js";

export async function collect(options: { contact: string; storage: string; output: string; enableTrylon?: boolean }, clock: Runtime = runtime) {
  const agent = userAgent(options.contact);
  const started = clock.now();
  const local = Temporal.Instant.fromEpochMilliseconds(started).toZonedDateTimeISO(timeZone);
  const firstDate = local.toPlainDate().toString();
  const slot = `${local.hour < 7 ? local.subtract({ days: 1 }).toPlainDate() : firstDate}:${local.hour >= 7 && local.hour < 19 ? "am" : "pm"}`;
  const httpDirectory = join(options.storage, "http");
  await mkdir(options.storage, { recursive: true });
  const lock = join(options.storage, "collect.lock");
  await mkdir(lock); // One collector owns request accounting and publication at a time.
  try {
    const outcomes = await Promise.allSettled(sourceIdSchema.options.map(async sourceId => {
      const previous = await readSource(options.storage, sourceId);
      const state = await readHttp(httpDirectory, sourceId);
      const save = () => saveHttp(httpDirectory, sourceId, state);
      let next = previous;
      let note = "";
      if (sourceId === "trylon" && !options.enableTrylon) note = "Live collection is disabled pending repeatable source access.";
      else if (state.paused) note = "Updates paused while source access is reviewed.";
      else if (started < state.nextAttemptAt) note = "Waiting before the next update attempt.";
      else if (state.slot === slot) note = "Showing the latest saved schedule.";
      else if (sourceId === "trylon" && (local.hour < 7 || local.hour >= 12 || started - state.lastRequestAt < dayMs)) {
        note = "Trylon is checked in the morning, at least 24 hours after its last request.";
      } else {
        state.slot = slot;
        await save();
        try {
          const http = createHttp(sourceId, agent, state, save, clock);
          const capture = await collectSource(sourceId, http, firstDate);
          next = acceptSource(previous, sourceId, capture.result, capture.responseAt);
          if (next.state.kind === "failed") throw new Error(next.state.error.message);
          state.failures = 0; state.nextAttemptAt = 0;
          // Keep only a bounded cache; only rediscovered pages enter the next parse.
          state.pages = Object.fromEntries(Object.entries(state.pages).filter(([, page]) => started - page.checkedAt < 14 * dayMs));
        } catch (error) {
          state.failures++;
          state.nextAttemptAt = Math.max(clock.now() + Math.min(7 * dayMs, 12 * 3_600_000 * 2 ** Math.min(state.failures - 1, 4)),
            error instanceof CollectionError ? error.retryAt : 0);
          if (error instanceof CollectionError && error.kind === "access") state.paused = error.message;
          next = failed(previous, { kind: error instanceof CollectionError ? error.kind : "parse",
            message: errorMessage(error), at: instantSchema.parse(new Date(clock.now()).toISOString()) });
        }
        await save();
        await writeSource(options.storage, sourceId, next);
      }
      const snapshot = lastGood(next.state);
      const warnings = next.diagnostics.filter(item => item.kind === "warning");
      if (next.state.kind === "failed") note = "Import failed; showing the last successfully collected schedule.";
      const stale = !snapshot || next.state.kind === "failed" || !!state.paused
        || clock.now() - Date.parse(snapshot.checkedAt) > (sourceId === "trylon" ? 36 : 24) * 3_600_000
        || (sourceId === "trylon" && !options.enableTrylon);
      const info: SourceInfo = { sourceId, checkedAt: snapshot?.checkedAt ?? null, changedAt: snapshot?.changedAt ?? null,
        stale, incomplete: warnings.length > 0, diagnostics: next.diagnostics,
        error: next.state.kind === "failed" ? next.state.error.message : state.paused,
        note: `${note}${warnings.length ? " Some dates or screening details remain unconfirmed; check the venue for its full schedule." : ""}`.trim() };
      return { info, screenings: sourceScreenings(next.state), failed: next.state.kind === "failed" || !!state.paused };
    }));
    const collected = outcomes.map(result => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });
    const sources = collected.map(source => source.info);
    const screenings = dedupe(collected.flatMap(source => source.screenings));
    await writeSite(options.output, datesFrom(firstDate, 14), screenings, sources);
    return { sources, screenings: screenings.length, failed: collected.some(source => source.failed) };
  } finally { await rmdir(lock); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await collect({ contact: process.env.TC_CONTACT ?? "",
      storage: resolve(process.argv[2] ?? ".state/live"), output: resolve(process.argv[3] ?? "site"),
      enableTrylon: process.env.TC_ENABLE_TRYLON === "1" });
    for (const source of result.sources) {
      console.log(`${source.sourceId}: ${source.checkedAt ?? "never checked"}. ${source.note}`);
      if (source.error) console.error(`${source.sourceId}: ${source.error}`);
      for (const note of source.diagnostics ?? []) console.log(`  ${note.kind}: ${note.record}: ${note.message}`);
    }
    console.log(`Published 14 date pages with ${result.screenings} screenings. No AI parsing.`);
    if (result.failed) process.exitCode = 1;
  } catch (error) { console.error(errorMessage(error)); process.exitCode = 1; }
}
