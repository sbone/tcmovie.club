import assert from "node:assert/strict";
import { test } from "node:test";
import { socialCard } from "../dist/social.js";

test("dated sharing cards count active screenings and show all five covered theaters", () => {
  const day = [
    { venueId: "trylon", status: { kind: "scheduled" } },
    { venueId: "trylon", status: { kind: "scheduled" } },
    { venueId: "main", status: { kind: "scheduled" } },
    { venueId: "parkway", status: { kind: "cancelled" } },
  ];
  const card = socialCard("2026-09-29", day);
  assert.match(card.svg, /TWIN CITIES MOVIE CLUB/);
  assert.match(card.svg, /Tuesday, September 29/);
  assert.match(card.svg, /3 screenings · 5 theaters covered/);
  assert.match(card.description, /3 screenings at Trylon and Main. See films on Tuesday, September 29, 2026/);
  for (const venue of ["Trylon", "Heights", "Parkway", "Riverview", "Main"]) assert.match(card.svg, new RegExp(`>${venue}</text>`));
  assert.doesNotMatch(card.svg, /\{\{/);
  assert.equal(socialCard("2026-09-29", [...day].reverse()).imagePath, card.imagePath);
  assert.notEqual(socialCard("2026-09-30", day).imagePath, card.imagePath);
  assert.notEqual(socialCard("2026-09-29", day.slice(1)).imagePath, card.imagePath);
  assert.match(socialCard("2026-09-29", []).description, /No screenings listed/);
  assert.match(socialCard("2026-09-29", []).svg, /0 screenings · 5 theaters covered/);
  assert.match(socialCard("2026-09-29", day.slice(0, 1)).svg, /1 screening · 5 theaters covered/);
});
