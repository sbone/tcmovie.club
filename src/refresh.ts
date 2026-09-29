import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { loadCapturedSource } from "./captures.js";
import { collect } from "./collect.js";
import { screeningSchema, timeZone } from "./domain.js";
import { errorMessage } from "./parse.js";
import { venueNames } from "./site.js";
import { acceptSource, emptySource } from "./store.js";
import { chicagoDate, datesFrom } from "./time.js";

function command(program: string, args: string[]): Promise<void> {
  return new Promise((done, reject) => {
    const child = spawn(program, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? done() : reject(new Error(`${program} exited with ${code}`)));
  });
}

async function refresh() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Run npm run refresh in an interactive terminal; deployment requires an explicit yes.");
  await command("python3", ["--version"]);
  const capture = await loadCapturedSource("trylon", resolve("test/fixtures"));
  const savedTrylon = acceptSource(emptySource(), "trylon", capture.result, capture.responseAt);
  if (savedTrylon.state.kind !== "ready") throw new Error("The saved Trylon capture could not be validated.");
  await mkdir(".state/previews", { recursive: true });
  const output = join(await mkdtemp(resolve(".state/previews/refresh-")), "site");
  console.log("Refreshing eligible theaters, including Trylon when its 24-hour wait has elapsed. No immediate retries.");
  const result = await collect({ contact: process.env.TC_CONTACT ?? "https://tcmovie.club",
    storage: resolve(".state/live"), output, savedTrylon, trylon: "manual" });
  const records = screeningSchema.array().parse(JSON.parse(await readFile(join(output, "screenings.json"), "utf8")));
  const dates = new Set(datesFrom(chicagoDate(new Date().toISOString()), 14));
  const stamp = new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" });
  console.log("\nNext 14 days — checked times in America/Chicago:");
  for (const source of result.sources) {
    const count = records.filter(show => show.venueId === source.sourceId && dates.has(chicagoDate(show.start.at))).length;
    console.log(`${venueNames[source.sourceId]}: ${count} screenings; ${source.checkedAt ? stamp.format(new Date(source.checkedAt)) : "NEVER CHECKED"}${source.stale ? " · STALE" : ""}${source.incomplete ? " · INCOMPLETE" : ""}`);
    if (source.note) console.log(`  ${source.note}`);
    if (source.error) console.log(`  ERROR: ${source.error}`);
    for (const note of source.diagnostics ?? []) if (note.kind !== "excluded") console.log(`  ${note.kind}: ${note.record}: ${note.message}`);
  }
  console.log(`\nPreview files: ${output}`);
  let server: ChildProcess | undefined;
  const stop = () => { server?.kill(); };
  const interrupt = () => { stop(); process.exit(130); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    server = spawn("python3", ["-u", "-m", "http.server", "0", "--bind", "127.0.0.1", "--directory", output],
      { stdio: ["ignore", "pipe", "inherit"] });
    const child = server;
    const port = await new Promise<string>((done, reject) => {
      let message = "";
      child.once("error", reject);
      child.once("exit", code => reject(new Error(`Preview server exited with ${code}`)));
      child.stdout!.on("data", chunk => {
        message += chunk.toString();
        const match = /Serving HTTP on 127\.0\.0\.1 port (\d+)/.exec(message);
        if (match?.[1]) done(match[1]);
      });
    });
    const url = `http://127.0.0.1:${port}/`;
    const response = await fetch(url);
    if (!response.ok || !(await response.text()).includes("Screenings on")) throw new Error("Local preview failed its HTTP smoke check.");
    console.log(`\nPreview: ${url}\nCheck today, another date, theater filters, and source freshness before deploying.`);
    if (process.platform === "darwin") await command("open", [url]).catch(() => console.log(`Open ${url} in your browser.`));
    if (!records.length || result.sources.some(source => !source.checkedAt)) {
      console.error("Deployment blocked: a theater has no saved schedule. Review the errors above before replacing the published site.");
      process.exitCode = 1;
      return;
    }
    if (result.failed || result.sources.some(source => source.stale || source.incomplete)) {
      console.log("This preview includes the stale/incomplete data or collection errors listed above.");
    }
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    let answer: string;
    try { answer = await terminal.question("Deploy this exact preview to https://tcmovie.club? [y/N] "); }
    finally { terminal.close(); }
    if (!/^(y|yes)$/i.test(answer.trim())) { console.log("Not deployed. Collected data and preview files are retained."); return; }
    await command("npx", ["wrangler", "pages", "deploy", output, "--project-name=tcmovieclub", "--branch=main"]);
    console.log("Deployed to https://tcmovie.club. Preview files and collection state are retained locally.");
  } finally {
    stop();
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
}

refresh().catch(error => { console.error(errorMessage(error)); process.exitCode = 1; });
