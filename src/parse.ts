import { decodeScreening } from "./domain.js";
import type { Screening } from "./domain.js";

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
    if (existing && JSON.stringify(existing) !== JSON.stringify(result.value)) {
      diagnostics.push({ kind: "invalid", record: result.value.id, message: "Conflicting duplicate identity" });
    } else {
      screenings.set(result.value.id, result.value);
    }
  }
  return {
    screenings: [...screenings.values()].sort((a, b) =>
      a.start.at.localeCompare(b.start.at) || a.id.localeCompare(b.id)),
    diagnostics,
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
