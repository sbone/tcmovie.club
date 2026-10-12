import assert from "node:assert/strict";
import { test } from "node:test";
import { socialCard } from "../dist/social.js";
import { load } from "cheerio";

test("dated sharing cards count active screenings and show all seven covered theaters", () => {
  const day = [
    { venueId: "trylon", status: { kind: "scheduled" } },
    { venueId: "trylon", status: { kind: "scheduled" } },
    { venueId: "main", status: { kind: "scheduled" } },
    { venueId: "parkway", status: { kind: "cancelled" } },
  ];
  const card = socialCard("2026-09-29", day);
  assert.match(card.svg, /TWIN CITIES MOVIE CLUB/);
  assert.match(card.svg, /Tuesday, September 29/);
  assert.match(card.svg, /3 screenings · 7 theaters covered/);
  assert.match(card.description, /3 screenings at Trylon and Main. See films on Tuesday, September 29, 2026/);
  for (const venue of ["Trylon", "Heights", "Parkway", "Riverview", "Main", "Grandview", "Highland"]) assert.match(card.svg, new RegExp(`>${venue}</text>`));
  const $ = load(card.svg, { xmlMode: true });
  const badges = $("rect[rx]").toArray();
  assert.equal(badges.length, 7);
  for (const badge of badges) {
    assert.ok(Number($(badge).attr("x")) + Number($(badge).attr("width")) <= 1128);
    assert.ok(Number($(badge).attr("y")) + Number($(badge).attr("height")) < 489);
  }
  assert.match(socialCard("2026-10-14", [
    { venueId: "grandview", status: { kind: "scheduled" } },
    { venueId: "highland", status: { kind: "scheduled" } },
  ]).description, /2 screenings at Grandview and Highland/);
  assert.doesNotMatch(card.svg, /\{\{/);
  assert.equal(socialCard("2026-09-29", [...day].reverse()).imagePath, card.imagePath);
  assert.notEqual(socialCard("2026-09-30", day).imagePath, card.imagePath);
  assert.notEqual(socialCard("2026-09-29", day.slice(1)).imagePath, card.imagePath);
  assert.match(socialCard("2026-09-29", []).description, /No screenings listed/);
  assert.match(socialCard("2026-09-29", []).svg, /0 screenings · 7 theaters covered/);
  assert.match(socialCard("2026-09-29", day.slice(0, 1)).svg, /1 screening · 7 theaters covered/);
});
