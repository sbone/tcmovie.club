import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { load } from "cheerio";

test("offline build combines four sources and retains a venue when its next import breaks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-generate-"));
  const captures = join(directory, "fixtures");
  const output = join(directory, "site");
  const state = join(directory, "state");
  const run = () => spawnSync(process.execPath, [resolve("dist/generate.js"), "2026-09-29", captures, output, state], { encoding: "utf8" });
  try {
    await cp("test/fixtures", captures, { recursive: true });
    const success = run();
    assert.equal(success.status, 0, success.stderr);
    const html = await readFile(join(output, "index.html"), "utf8");
    const $ = load(html);
    // The captured Trylon feed has no Sep 29 events; don't invent the indexed homepage's listings.
    assert.equal($("main li").length, 6);
    assert.equal($("script, img, link").length, 0);
    assert.ok(gzipSync(html).length < 25000);
    assert.equal((await readdir(output)).filter(name => /^2026-/.test(name)).length, 14);
    assert.ok($("main").text().includes("Poltergeist"));
    assert.ok($("main").text().includes("Doors 7:00 PM"));
    assert.ok($("main").text().includes("Winter Hymns"));
    assert.ok($("main").text().includes("The Odyssey"));
    assert.ok($("main").text().includes("AKIRA (1988)"));
    const tomorrow = load(await readFile(join(output, "2026-09-30/index.html"), "utf8"));
    const akira = tomorrow("main li").filter((_, el) => tomorrow(el).text().includes("AKIRA (1988)"));
    assert.equal(akira.length, 1);
    assert.equal(akira.find("time").text(), "4:30 PM");
    const before = JSON.parse(await readFile(join(state, "heights.json"), "utf8"));
    await writeFile(join(captures, "heights/home.html"), "<html>New site design</html>");
    const failure = run();
    assert.equal(failure.status, 1);
    const after = JSON.parse(await readFile(join(state, "heights.json"), "utf8"));
    assert.equal(after.state.kind, "failed");
    assert.deepEqual(after.state.lastGood, before.state.snapshot);
    const fallback = load(await readFile(join(output, "index.html"), "utf8"));
    assert.ok(fallback("main").text().includes("Winter Hymns"));
    assert.ok(fallback("footer").text().includes("Import failed"));
    assert.equal(JSON.parse(await readFile(join(state, "parkway.json"), "utf8")).state.kind, "ready");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
