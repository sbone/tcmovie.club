import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm, access, readdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { deployMain } from "../scripts/deploy-main.mjs";
import { productionCommit } from "../dist/deployment.js";

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "tc-production-"));
  const repo = join(directory, "developer"), remote = join(directory, "origin.git");
  await mkdir(repo);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "Test"); git(repo, "config", "user.email", "test@example.com");
  await writeFile(join(repo, ".gitignore"), ".state/\n");
  await writeFile(join(repo, "version.txt"), "main");
  git(repo, "add", "."); git(repo, "commit", "-m", "main");
  git(repo, "clone", "--bare", repo, remote);
  git(repo, "remote", "add", "origin", remote);
  const commit = git(repo, "rev-parse", "HEAD");
  git(repo, "switch", "-c", "feature");
  await writeFile(join(repo, "version.txt"), "unmerged feature");
  git(repo, "commit", "-am", "feature");
  await writeFile(join(repo, "version.txt"), "dirty feature");
  await writeFile(join(repo, "untracked.txt"), "local only");
  await mkdir(join(repo, ".state/live"), { recursive: true });
  await writeFile(join(repo, ".state/live/budget.json"), "preserve request accounting");
  return { directory, repo, remote, commit };
}

test("production uses fetched main despite feature, dirty, and untracked local files; preserves shared state", async () => {
  const f = await fixture();
  const previous = process.cwd(), originalCommit = process.env.TC_PRODUCTION_COMMIT;
  const calls = [];
  try {
    // Make the local tracking ref actively wrong; the fetch must replace it.
    git(f.repo, "update-ref", "refs/remotes/origin/main", git(f.repo, "rev-parse", "HEAD"));
    const result = await deployMain(f.repo, ["--auto"], async (program, args, options) => {
      calls.push([program, ...args]);
      if (program === "npm") {
        assert.equal(await readFile(join(options.cwd, "version.txt"), "utf8"), "main");
        await assert.rejects(access(join(options.cwd, "untracked.txt")));
        await assert.rejects(access(join(options.cwd, ".state")), "tests have no shared live state");
      }
      if (args.includes("dist/refresh.js")) {
        assert.equal(await realpath(join(options.cwd, ".state/live")), await realpath(join(f.repo, ".state/live")));
        process.chdir(options.cwd); process.env.TC_PRODUCTION_COMMIT = options.env.TC_PRODUCTION_COMMIT;
        assert.equal(await productionCommit(), f.commit);
        await writeFile("version.txt", "changed after checks");
        await assert.rejects(productionCommit(), /Production source changed/);
        process.chdir(previous);
      }
    });
    assert.equal(result.commit, f.commit);
    assert.equal(result.status, "finished");
    assert.deepEqual(calls.slice(0, 2), [["npm", "ci", "--no-audit", "--no-fund"], ["npm", "run", "check"]]);
    assert.equal(calls.length, 4);
    assert.equal(await readFile(join(f.repo, "version.txt"), "utf8"), "dirty feature");
    assert.equal(git(f.repo, "branch", "--show-current"), "feature");
    assert.equal(await readFile(join(f.repo, ".state/live/budget.json"), "utf8"), "preserve request accounting");
    const [run] = await readdir(join(f.repo, ".state/deployments"));
    const report = JSON.parse(await readFile(join(f.repo, ".state/deployments", run, "report.json")));
    assert.equal(report.commit, f.commit);
    assert.ok(report.finishedAt);
    await assert.rejects(access(join(f.repo, ".state/deployments", run, "source")));
    await assert.rejects(access(join(f.repo, ".state/production.lock")));
  } finally {
    process.chdir(previous);
    if (originalCommit === undefined) delete process.env.TC_PRODUCTION_COMMIT; else process.env.TC_PRODUCTION_COMMIT = originalCommit;
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("check-only stops before collection; failed tests and failed fetch never reach refresh", async () => {
  const f = await fixture();
  try {
    const calls = [];
    await deployMain(f.repo, ["--check-only"], async (program, args) => { calls.push([program, ...args]); });
    assert.equal(calls.length, 2);
    let checked = 0;
    await assert.rejects(deployMain(f.repo, ["--auto"], async (_program, args) => {
      checked++; if (args.includes("check")) throw new Error("checks failed");
    }), /checks failed/);
    assert.equal(checked, 2);
    git(f.repo, "remote", "set-url", "origin", join(f.directory, "missing-remote"));
    await assert.rejects(deployMain(f.repo, ["--auto"], async () => { assert.fail("must not use stale main"); }), /fetch/);
    await assert.rejects(access(join(f.repo, ".state/production.lock")));
    assert.equal(await readFile(join(f.repo, ".state/live/budget.json"), "utf8"), "preserve request accounting");
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("direct deployment without launcher provenance fails closed", async () => {
  const original = process.env.TC_PRODUCTION_COMMIT;
  try { delete process.env.TC_PRODUCTION_COMMIT; await assert.rejects(productionCommit(), /origin\/main launcher/); }
  finally { if (original !== undefined) process.env.TC_PRODUCTION_COMMIT = original; }
});
