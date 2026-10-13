import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const script = resolve("scripts/clean.mjs");
const exists = path => access(path).then(() => true, () => false);
const run = (cwd, ...args) => {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};

test("cleanup expires completed snapshots but preserves recent, unfinished, unknown and live data", async () => {
  const root = await mkdtemp(join(tmpdir(), "tc-cleanup-"));
  try {
    const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
    const recent = new Date().toISOString();
    for (const parent of ["runs", "previews"]) {
      const marker = parent === "runs" ? "report.json" : "finished.json";
      for (const [name, value] of [["refresh-old", { finishedAt: old }], ["refresh-recent", { finishedAt: recent }],
        ["refresh-running", {}], ["refresh-invalid", null], ["keep-other", { finishedAt: old }]]) {
        const directory = join(root, ".state", parent, name);
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, marker), JSON.stringify(value));
      }
    }
    await mkdir(join(root, ".state/live/auto.lock"), { recursive: true });
    await writeFile(join(root, ".state/live/heights.json"), "preserve last-good evidence");
    await symlink(join(root, ".state/live"), join(root, ".state/runs/refresh-link"));
    assert.match(run(root, "--history", "--dry-run"), /Would remove/);
    assert.ok(await exists(join(root, ".state/runs/refresh-old")));
    run(root, "--history");
    for (const parent of ["runs", "previews"]) {
      assert.equal(await exists(join(root, ".state", parent, "refresh-old")), false);
      for (const name of ["refresh-recent", "refresh-running", "refresh-invalid", "keep-other"]) {
        assert.ok(await exists(join(root, ".state", parent, name)));
      }
    }
    assert.ok(await exists(join(root, ".state/live/heights.json")));
    assert.ok(await exists(join(root, ".state/live/auto.lock")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("generated cleanup removes reproducible output only and does not follow state symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "tc-cleanup-"));
  try {
    for (const name of ["dist", "site", ".state/demo", ".state/live", ".state/mann-verification", "test/fixtures", "node_modules"]) {
      await mkdir(join(root, name), { recursive: true });
    }
    await writeFile(join(root, ".env.local"), "private configuration");
    run(root, "--build");
    assert.equal(await exists(join(root, "dist")), false);
    assert.ok(await exists(join(root, "site")));
    run(root, "--generated");
    for (const name of ["site", ".state/demo"]) assert.equal(await exists(join(root, name)), false);
    for (const name of [".state/live", ".state/mann-verification", "test/fixtures", "node_modules", ".env.local"]) {
      assert.ok(await exists(join(root, name)));
    }
    const linked = join(root, "linked-checkout");
    await mkdir(linked);
    await symlink(join(root, ".state"), join(linked, ".state"));
    await mkdir(join(root, ".state/demo"));
    run(linked, "--generated");
    run(linked, "--history");
    assert.ok(await exists(join(root, ".state/demo")));
    assert.notEqual(spawnSync(process.execPath, [script, "--all"], { cwd: root }).status, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
