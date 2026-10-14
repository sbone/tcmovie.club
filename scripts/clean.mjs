import { lstat, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const args = process.argv.slice(2);
const modes = args.filter(arg => ["--build", "--generated", "--history"].includes(arg));
if (modes.length !== 1 || args.some(arg => !["--build", "--generated", "--history", "--dry-run"].includes(arg))) {
  throw new Error("Usage: node scripts/clean.mjs --build|--generated|--history [--dry-run]");
}
const dryRun = args.includes("--dry-run");
const stat = async path => {
  try { return await lstat(path); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
};
const remove = async path => {
  if (!await stat(path)) return;
  console.log(`${dryRun ? "Would remove" : "Removing"} ${path}`);
  if (!dryRun) await rm(path, { recursive: true, force: true });
};

if (modes[0] !== "--history") {
  await remove("dist");
  if (modes[0] === "--generated") {
    await remove("site");
    if ((await stat(".state"))?.isDirectory()) await remove(".state/demo");
  }
} else if ((await stat(".state"))?.isDirectory()) {
  const cutoff = Date.now() - 30 * 86_400_000;
  for (const [parent, marker, prefix] of [[".state/runs", "report.json", "refresh"], [".state/previews", "finished.json", "refresh"], [".state/deployments", "report.json", "main"]]) {
    if (!(await stat(parent))?.isDirectory()) continue;
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      if (!entry.isDirectory() || !new RegExp(`^${prefix}-[\\w-]+$`).test(entry.name)) continue;
      const path = join(parent, entry.name);
      let finishedAt;
      try {
        const value = JSON.parse(await readFile(join(path, marker), "utf8"))?.finishedAt;
        finishedAt = typeof value === "string" ? Date.parse(value) : NaN;
      }
      catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) continue; throw error; }
      if (Number.isFinite(finishedAt) && finishedAt < cutoff) await remove(path);
    }
  }
}
