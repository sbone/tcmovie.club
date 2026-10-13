import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { load } from "cheerio";
import { smokeSite } from "../dist/automation.js";
import { writeSite } from "../dist/site.js";

test("regenerating an output directory removes obsolete generated pages and images only", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-output-"));
  try {
    await writeSite(directory, ["2026-10-12", "2026-10-13"], [], []);
    await writeFile(join(directory, "notes.txt"), "keep custom files");
    await writeFile(join(directory, "social/2026-10-13-000000000000.png"), "obsolete hash");
    await writeFile(join(directory, "social/custom.png"), "keep custom images");
    await writeSite(directory, ["2026-10-13", "2026-10-14"], [], []);
    assert.deepEqual((await readdir(directory)).filter(name => /^2026-/.test(name)).sort(), ["2026-10-13", "2026-10-14"]);
    const images = await readdir(join(directory, "social"));
    assert.equal(images.filter(name => /^2026-/.test(name)).length, 2);
    assert.ok(!images.includes("2026-10-13-000000000000.png"));
    assert.equal(await readFile(join(directory, "notes.txt"), "utf8"), "keep custom files");
    assert.equal(await readFile(join(directory, "social/custom.png"), "utf8"), "keep custom images");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("offline build combines seven sources and retains a venue when its next import breaks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tc-generate-"));
  const captures = join(directory, "fixtures");
  const output = join(directory, "site");
  const state = join(directory, "state");
  const run = () => spawnSync(process.execPath, [resolve("dist/generate.js"), "2026-09-29", captures, output, state], { encoding: "utf8" });
  try {
    await cp("test/fixtures", captures, { recursive: true });
    const success = run();
    assert.equal(success.status, 0, success.stderr);
    for (const venue of ["grandview", "highland"]) {
      const saved = JSON.parse(await readFile(join(state, `${venue}.json`), "utf8"));
      assert.equal(saved.state.kind, "ready");
      assert.equal(saved.state.snapshot.screenings.length, 4);
      assert.ok(saved.state.snapshot.screenings.every(show => show.venueId === venue));
    }
    assert.equal((await smokeSite(output, "2026-09-29")).pages, 14);
    const html = await readFile(join(output, "index.html"), "utf8");
    const $ = load(html);
    // The reviewed film page supplements the feed's missing Sep 29 Trylon screenings.
    assert.equal($(".screenings li").length, 22);
    assert.equal($("script[src], img, link:not([rel=canonical])").length, 0);
    assert.equal($("script").length, 1);
    assert.equal($("meta[property='og:url']").attr("content"), "https://tcmovie.club/");
    const imagePath = new URL($("meta[property='og:image']").attr("content")).pathname;
    const shareImage = await readFile(join(output, imagePath));
    assert.equal(shareImage.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(shareImage.readUInt32BE(16), 1200);
    assert.equal(shareImage.readUInt32BE(20), 630);
    assert.ok(gzipSync(html).length < 25000);
    assert.equal((await readdir(output)).filter(name => /^2026-/.test(name)).length, 14);
    assert.ok($("main").text().includes("Poltergeist"));
    assert.ok($("main").text().includes("Doors 7:00 PM"));
    assert.ok($("main").text().includes("Winter Hymns"));
    assert.ok($("main").text().includes("The Odyssey"));
    assert.ok($("main").text().includes("AKIRA (1988)"));
    assert.ok($("main").text().includes("Je Tu Il Elle"));
    assert.ok($("main").text().includes("The Main Cinema"));
    const tomorrow = load(await readFile(join(output, "2026-09-30/index.html"), "utf8"));
    assert.equal(tomorrow("meta[property='og:url']").attr("content"), "https://tcmovie.club/2026-09-30/");
    const akira = tomorrow(".screenings li").filter((_, el) => tomorrow(el).text().includes("AKIRA (1988)"));
    assert.equal(akira.length, 1);
    assert.equal(akira.find("time").text(), "4:30 PM");
    assert.ok(tomorrow("main").text().includes("Sold out"));
    const october7 = load(await readFile(join(output, "2026-10-07/index.html"), "utf8"));
    assert.ok(october7("main").text().includes("They're Here"));
    assert.ok(october7("main").text().includes("Parasite"));
    const october10 = load(await readFile(join(output, "2026-10-10/index.html"), "utf8"));
    assert.equal(october10(".screenings li").filter((_, el) => october10(el).text().includes("HUMP!")).length, 2);
    assert.equal(october10(".screenings li").filter((_, el) => october10(el).text().includes("Kiki")).length, 1);
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
    assert.equal((await smokeSite(output, "2026-09-29")).pages, 14, "last-good fallback still permits publication");
    const sourceFile = join(output, "sources.json");
    const summaries = JSON.parse(await readFile(sourceFile, "utf8"));
    summaries[0].checkedAt = null;
    await writeFile(sourceFile, JSON.stringify(summaries));
    await assert.rejects(smokeSite(output, "2026-09-29"), /no saved schedule/);
    summaries[0].checkedAt = "2026-09-29T11:16:22Z";
    await writeFile(sourceFile, JSON.stringify(summaries));
    await writeFile(join(output, "2026-09-30/index.html"), "<html>Broken page</html>");
    await assert.rejects(smokeSite(output, "2026-09-29"), /Screenings on/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
