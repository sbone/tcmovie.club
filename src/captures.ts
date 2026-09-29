import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { httpUrlSchema, instantSchema, screeningSchema } from "./domain.js";
import type { Result, Screening, SourceId } from "./domain.js";
import { finishParse } from "./parse.js";
import type { Diagnostic, ParsedSource } from "./parse.js";
import { parseTrylon } from "./sources/trylon.js";
import { parseHeights, parseHeightsCalendar } from "./sources/heights.js";
import { parseRiverview, parseRiverviewSpecials } from "./sources/riverview.js";
import { parseParkway } from "./sources/parkway.js";

const metadataSchema = z.object({ sourceUrl: httpUrlSchema, responseAt: instantSchema });

export async function loadCapturedSource(sourceId: SourceId, directory: string) {
  const read = (name: string) => readFile(join(directory, sourceId, name), "utf8");
  const file = sourceId === "trylon" ? "calendar.ics" : sourceId === "parkway" ? "movies.html" : "home.html";
  const metadataFile = sourceId === "trylon" ? "metadata.json" : file.replace(".html", ".metadata.json");
  const metadata = metadataSchema.parse(JSON.parse(await read(metadataFile)));
  const raw = await read(file);
  const files = (await readdir(join(directory, sourceId))).sort();
  const supplemental = files.filter(name => name.endsWith(".metadata.json") && name !== metadataFile);
  const combine = (results: readonly Result<ParsedSource, string>[]): Result<ParsedSource, string> => {
    const screenings: Screening[] = [], diagnostics: Diagnostic[] = [];
    for (const result of results) {
      if (result.kind === "err") return result;
      screenings.push(...result.value.screenings); diagnostics.push(...result.value.diagnostics);
    }
    // Calendar markup omits DCP where the homepage explicitly supplies it.
    const formats = new Map(screenings.filter(item => item.format).map(item => [item.id, item.format]));
    return { kind: "ok", value: finishParse(screenings.map(item => ({
      ...item, format: item.format ?? formats.get(item.id) ?? null,
    })), diagnostics) };
  };
  const parse = async () => {
    switch (sourceId) {
      case "trylon": {
        const result = parseTrylon(raw);
        if (result.kind === "err" || !files.includes("reviewed.json")) return result;
        const reviewed = z.array(screeningSchema).parse(JSON.parse(await read("reviewed.json")));
        const ids = new Set(reviewed.map(item => item.id));
        return { kind: "ok" as const, value: finishParse([
          ...result.value.screenings.filter(item => !ids.has(item.id)), ...reviewed,
        ], [...result.value.diagnostics, { kind: "warning", record: "reviewed.json",
          message: "Offline corrections from indexed film pages; see reviewed metadata for provenance" }]) };
      }
      case "heights": return combine([parseHeights(raw), ...await Promise.all(supplemental.map(async name =>
        parseHeightsCalendar(await read(name.replace(".metadata.json", ".html")))))]);
      case "riverview":
      case "parkway": {
        const details: Record<string, string> = {};
        const listings = [raw];
        const specials: Result<ParsedSource, string>[] = [];
        for (const name of supplemental) {
          const detailMeta = metadataSchema.pick({ sourceUrl: true }).parse(JSON.parse(await read(name)));
          const path = new URL(detailMeta.sourceUrl).pathname;
          const html = await read(name.replace(".metadata.json", ".html"));
          if (sourceId === "riverview" && path.startsWith("/base/index/")) listings.push(html);
          else if (sourceId === "riverview" && path === "/specialscreening") specials.push(parseRiverviewSpecials(html, raw));
          else details[path] = html;
        }
        return sourceId === "riverview" ? combine([...listings.map(html => parseRiverview(html, details)), ...specials]) : parseParkway(raw, details);
      }
      default: return sourceId satisfies never;
    }
  };
  return { responseAt: metadata.responseAt, result: await parse() };
}
