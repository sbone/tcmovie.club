import { decodeScreening } from "./domain.js";
import type { Result, Screening } from "./domain.js";

export type Diagnostic = Readonly<{
  kind: "excluded" | "invalid" | "warning";
  record: string;
  message: string;
}>;

export type ParsedSource = Readonly<{
  screenings: readonly Screening[];
  diagnostics: readonly Diagnostic[];
}>;

export function finishParse(candidates: readonly unknown[], notes: readonly Diagnostic[]): ParsedSource {
  const screenings = new Map<string, Screening>();
  const diagnostics = [...notes];
  for (const [index, candidate] of candidates.entries()) {
    const result = decodeScreening(candidate);
    if (result.kind === "err") {
      diagnostics.push({ kind: "invalid", record: String(index),
        message: result.error.map(issue => `${issue.path}: ${issue.message}`).join("; ") });
      continue;
    }
    const existing = screenings.get(result.value.id);
    // The daily listing and specials/calendar may omit each other's optional metadata.
    const merge = (item: Screening, other: Screening): Screening => ({ ...item,
      format: item.format ?? other.format, series: item.series ?? other.series,
      tags: [...new Set([...item.tags, ...other.tags])].sort(),
    });
    const incoming = existing ? merge(result.value, existing) : result.value;
    if (existing && JSON.stringify(merge(existing, result.value)) !== JSON.stringify(incoming)) {
      diagnostics.push({ kind: "invalid", record: result.value.id, message: "Conflicting duplicate identity" });
    } else {
      screenings.set(incoming.id, incoming);
    }
  }
  return {
    screenings: [...screenings.values()].sort((a, b) =>
      a.start.at.localeCompare(b.start.at) || a.id.localeCompare(b.id)),
    diagnostics,
  };
}

export function combineParsed(results: readonly Result<ParsedSource, string>[]): Result<ParsedSource, string> {
  const screenings: Screening[] = [], diagnostics: Diagnostic[] = [];
  for (const result of results) {
    if (result.kind === "err") return result;
    screenings.push(...result.value.screenings); diagnostics.push(...result.value.diagnostics);
  }
  return { kind: "ok", value: finishParse(screenings, diagnostics) };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
