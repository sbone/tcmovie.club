import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { commitTrackedChanges } from "../dist/refresh.js";

test("publish commits tracked edits and staged additions, skips data and empty commits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-publish-"));
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  try {
    git("init", "--quiet");
    git("config", "user.name", "Publication test");
    git("config", "user.email", "test@example.com");
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", "/dev/null");
    await writeFile(join(directory, ".gitignore"), ".state/\n");
    await writeFile(join(directory, "page.txt"), "old");
    git("add", ".gitignore", "page.txt");
    git("commit", "--quiet", "-m", "Initial");
    await writeFile(join(directory, "page.txt"), "updated");
    await writeFile(join(directory, "new.txt"), "staged");
    git("add", "new.txt");
    await writeFile(join(directory, "private.txt"), "untracked");
    await mkdir(join(directory, ".state"));
    await writeFile(join(directory, ".state", "capture.json"), "{}");
    assert.equal(await commitTrackedChanges(directory), true);
    assert.equal(git("show", "HEAD:page.txt"), "updated");
    assert.equal(git("show", "HEAD:new.txt"), "staged");
    assert.equal(git("ls-files", "private.txt", ".state/capture.json"), "");
    const head = git("rev-parse", "HEAD");
    assert.equal(await commitTrackedChanges(directory), false);
    assert.equal(git("rev-parse", "HEAD"), head);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
