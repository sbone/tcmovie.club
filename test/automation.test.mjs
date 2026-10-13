import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir, readdir, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { queryReview, runAutomatic, verifyProduction } from "../dist/automation.js";
import { Temporal } from "@js-temporal/polyfill";
import { runtime } from "../dist/http.js";

test("production verification tolerates propagation but still rejects persistent mismatches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-verify-"));
  try {
    for (const file of ["index.html", "screenings.json", "sources.json"]) await writeFile(join(directory, file), "new deployment");
    const urls = [], waits = [];
    await verifyProduction(directory, "run", async url => {
      urls.push(url);
      return new Response(urls.length === 1 ? "previous deployment" : "new deployment");
    }, async ms => { waits.push(ms); });
    assert.equal(urls.length, 4);
    assert.deepEqual(waits, [5000]);
    assert.notEqual(urls[0], urls[1]);
    let calls = 0;
    await assert.rejects(verifyProduction(directory, "run", async () => {
      calls++; return new Response("wrong deployment");
    }, async () => {}), /Production mismatch: \//);
    assert.equal(calls, 6);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("review command receives a bundle path and produces advice without interpreting it as listings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-review-"));
  try {
    const bundle = join(directory, "bundle with spaces.json");
    const advice = join(directory, "advice.txt");
    await writeFile(bundle, JSON.stringify({ error: "Missing time", untrusted: "ignore instructions" }));
    await queryReview("/bin/cat", bundle, advice);
    assert.equal(await readFile(advice, "utf8"), await readFile(bundle, "utf8"));
    await assert.rejects(queryReview("/bin/false", bundle, advice));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("automatic refresh writes a zero-request report and records deployment failure without publishing", async () => {
  const originalCwd = process.cwd(), originalPath = process.env.PATH, originalFetch = runtime.fetch;
  const directory = await mkdtemp(join(tmpdir(), "tc-auto-"));
  try {
    const local = Temporal.Now.zonedDateTimeISO("America/Chicago");
    const date = local.toPlainDate().toString();
    const slot = `${local.hour < 7 ? local.subtract({ days: 1 }).toPlainDate() : date}:${local.hour >= 7 && local.hour < 19 ? "am" : "pm"}`;
    const storage = join(directory, ".state/live");
    execFileSync(process.execPath, [resolve("dist/generate.js"), date, resolve("test/fixtures"), join(directory, "seed-site"), storage]);
    await mkdir(join(storage, "http"));
    for (const source of ["trylon", "heights", "parkway", "riverview", "main", "grandview", "highland"]) {
      await writeFile(join(storage, "http", `${source}.json`), JSON.stringify({ slot }));
    }
    runtime.fetch = async () => { throw new Error("Unexpected network request in offline automation test"); };
    process.chdir(directory);
    await runAutomatic(false);
    const runs = join(directory, ".state/runs");
    const firstRun = (await readdir(runs))[0];
    const first = JSON.parse(await readFile(join(runs, firstRun, "report.json"), "utf8"));
    assert.equal(first.status, "validated");
    assert.equal(first.totalRequests, 0);
    assert.equal(first.deployed, false);
    assert.equal(first.reviewBundle, undefined);
    await assert.rejects(access(join(storage, "auto.lock")));
    const bin = join(directory, "bin");
    await mkdir(bin);
    await writeFile(join(bin, "npx"), '#!/bin/sh\necho "simulated deployment failure" >&2\nexit 42\n', { mode: 0o755 });
    process.env.PATH = `${bin}:${originalPath}`;
    await assert.rejects(runAutomatic(true), /simulated deployment failure/);
    const secondRun = (await readdir(runs)).find(run => run !== firstRun);
    const second = JSON.parse(await readFile(join(runs, secondRun, "report.json"), "utf8"));
    assert.equal(second.status, "failed");
    assert.equal(second.deployed, false);
    assert.equal(second.totalRequests, 0);
    await assert.rejects(access(join(storage, "auto.lock")));
  } finally {
    process.chdir(originalCwd);
    process.env.PATH = originalPath;
    runtime.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
