import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { httpUrlSchema, instantSchema } from "./domain.js";
import type { SourceId } from "./domain.js";
import { parseTrylon } from "./sources/trylon.js";
import { parseHeights } from "./sources/heights.js";
import { parseRiverview } from "./sources/riverview.js";
import { parseParkway } from "./sources/parkway.js";

const metadataSchema = z.object({ sourceUrl: httpUrlSchema, responseAt: instantSchema });

export async function loadCapturedSource(sourceId: SourceId, directory: string) {
  const read = (name: string) => readFile(join(directory, sourceId, name), "utf8");
  const file = sourceId === "trylon" ? "calendar.ics" : sourceId === "parkway" ? "movies.html" : "home.html";
  const metadataFile = sourceId === "trylon" ? "metadata.json" : file.replace(".html", ".metadata.json");
  const metadata = metadataSchema.parse(JSON.parse(await read(metadataFile)));
  const raw = await read(file);
  const parse = async () => {
    switch (sourceId) {
      case "trylon": return parseTrylon(raw);
      case "heights": return parseHeights(raw);
      case "riverview":
      case "parkway": {
        const detailMeta = metadataSchema.parse(JSON.parse(await read("film.metadata.json")));
        const details = { [new URL(detailMeta.sourceUrl).pathname]: await read("film.html") };
        return sourceId === "riverview" ? parseRiverview(raw, details) : parseParkway(raw, details);
      }
      default: return sourceId satisfies never;
    }
  };
  return { responseAt: metadata.responseAt, result: await parse() };
}
