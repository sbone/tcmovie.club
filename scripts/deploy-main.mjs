import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, rmdir, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const command = (program, args, options) => new Promise((done, reject) => {
  const child = spawn(program, args, { ...options, stdio: "inherit" });
  child.once("error", reject);
  child.once("exit", (code, signal) => code === 0 ? done() : reject(new Error(`${program} failed (${signal ?? code})`)));
});

// Also installed outside the checkout for launchd, so switching branches cannot
// switch the production launcher. Only Node's standard library is required.
export async function deployMain(repository, args, run = command) {
  if (args.some(arg => !["--auto", "--no-deploy", "--check-only"].includes(arg))
    || (args.includes("--no-deploy") && !args.includes("--auto"))) {
    throw new Error("Usage: npm run refresh [-- --auto [--no-deploy] | --check-only]. Merge code to origin/main before publishing.");
  }
  repository = resolve(repository);
  const state = join(repository, ".state");
  await mkdir(state, { recursive: true });
  const lock = join(state, "production.lock");
  await mkdir(lock); // Covers fetch, checks, collection, manual approval, and deployment.
  let directory;
  const report = { source: "origin/main", startedAt: new Date().toISOString(), status: "fetching" };
  try {
    await mkdir(join(state, "deployments"), { recursive: true });
    directory = await mkdtemp(join(state, "deployments/main-"));
    const source = join(directory, "source");
    const git = args => exec("git", ["-C", repository, ...args], {
      timeout: 60_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    // Never fall back to a stale ref if the remote is unavailable.
    await git(["fetch", "--no-tags", "origin", "+refs/heads/main:refs/remotes/origin/main"]);
    report.commit = (await git(["rev-parse", "refs/remotes/origin/main^{commit}"])).stdout.trim();
    console.log(`Production source: origin/main at ${report.commit}`);
    await git(["clone", "--shared", "--no-checkout", repository, source]);
    await exec("git", ["-C", source, "checkout", "--detach", report.commit]);
    await exec("git", ["-C", source, "update-ref", "refs/remotes/origin/main", report.commit]);
    const env = { ...process.env, TC_PRODUCTION_COMMIT: report.commit };
    const options = { cwd: source, env };
    report.status = "checking";
    await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2));
    await run("npm", ["ci", "--no-audit", "--no-fund"], options);
    await run("npm", ["run", "check"], options);
    if (!args.includes("--check-only")) {
      // Link only after tests: source checks cannot touch the production cache.
      await mkdir(join(source, ".state"), { recursive: true });
      for (const name of ["live", "runs", "previews"]) {
        await mkdir(join(state, name), { recursive: true });
        await symlink(join(state, name), join(source, ".state", name), "dir");
      }
      await run(process.execPath, [join(source, "scripts/clean.mjs"), "--history"], { cwd: repository, env });
      report.status = "refreshing";
      await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2));
      await run(process.execPath, [`--env-file-if-exists=${join(repository, ".env.local")}`, "dist/refresh.js", ...args], options);
    }
    report.status = args.includes("--check-only") ? "checked" : "finished";
    return report;
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
    throw error;
  } finally {
    try {
      if (directory) {
        // rm removes state symlinks themselves, never their shared targets.
        await rm(join(directory, "source"), { recursive: true, force: true });
        await writeFile(join(directory, "report.json"), JSON.stringify({ ...report, finishedAt: new Date().toISOString() }, null, 2));
        console.log(`Production source report: ${join(directory, "report.json")}`);
      }
    } finally { await rmdir(lock); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  deployMain(process.cwd(), process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
