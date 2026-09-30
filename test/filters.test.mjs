import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { initTheaterFilters } from "../dist/filters.js";

// Exercise the embedded browser function without a DOM dependency or network.
function page(search = "") {
  const element = (dataset = {}) => ({ dataset, hidden: false, attributes: {}, listeners: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    click() { this.listeners.click(); },
  });
  const buttons = ["trylon", "heights", "parkway", "riverview", "main"].map(theater => element({ theater }));
  const rows = ["trylon", "heights", "main"].map(venue => element({ venue }));
  const links = [{ href: "/2026-09-30/" }];
  const status = element(), reset = element();
  const controls = { hidden: true, querySelectorAll: () => buttons, querySelector: () => reset };
  const document = {
    querySelector: selector => ({ "#theater-filters": controls, "#filter-status": status })[selector],
    querySelectorAll: selector => ({ ".screenings li[data-venue]": rows, 'nav[aria-label="Dates"] a': links })[selector],
  };
  const location = { href: `https://tcmovie.club/2026-09-29/${search}` };
  const history = { pushState: (_state, _title, url) => { location.href = url.href; } };
  const listeners = {};
  const window = { addEventListener: (name, callback) => { listeners[name] = callback; } };
  runInNewContext(`(${initTheaterFilters.toString()})();`, { document, location, history, window, URL });
  return { buttons, rows, links, status, reset, controls, location, listeners,
    visible: () => rows.filter(row => !row.hidden).map(row => row.dataset.venue) };
}

test("theater selections round-trip through URLs, date links, reset, and history", () => {
  const p = page("?theaters=trylon,heights&keep=1#schedule");
  assert.deepEqual(p.visible(), ["trylon", "heights"]);
  assert.equal(p.controls.hidden, false);
  assert.equal(p.buttons[4].attributes["aria-pressed"], "false");
  p.buttons[1].click();
  assert.deepEqual(p.visible(), ["trylon"]);
  assert.equal(p.status.textContent, "1 screening shown");
  assert.equal(new URL(p.location.href).searchParams.get("theaters"), "trylon");
  assert.equal(new URL(p.location.href).searchParams.get("keep"), "1");
  assert.equal(new URL(p.location.href).hash, "#schedule");
  assert.equal(p.links[0].href, "https://tcmovie.club/2026-09-30/?theaters=trylon");
  p.buttons[4].click();
  assert.deepEqual(p.visible(), ["trylon", "main"]);
  p.location.href = "https://tcmovie.club/2026-09-29/?theaters=heights";
  p.listeners.popstate();
  assert.deepEqual(p.visible(), ["heights"]);
  p.reset.click();
  assert.equal(new URL(p.location.href).searchParams.has("theaters"), false);
  assert.equal(p.links[0].href, "https://tcmovie.club/2026-09-30/");
  assert.equal(p.reset.disabled, true);
});

test("old ratings URLs leave theater filtering working and are dropped from date links", () => {
  const p = page("?ratings=1&theaters=main");
  assert.deepEqual(p.visible(), ["main"]);
  assert.equal(new URL(p.links[0].href).searchParams.has("ratings"), false);
  p.reset.click();
  assert.equal(new URL(p.location.href).searchParams.has("ratings"), false);
  assert.equal(p.visible().length, 3);
});

test("all, none, unknown venues, and selected venues with no screenings stay distinct", () => {
  const all = page();
  assert.equal(all.visible().length, 3);
  for (const button of all.buttons) button.click();
  assert.equal(all.visible().length, 0);
  assert.equal(new URL(all.location.href).searchParams.get("theaters"), "");
  assert.match(all.status.textContent, /No theaters selected/);
  assert.equal(page("?theaters=").visible().length, 0);
  assert.deepEqual(page("?theaters=unknown,heights").visible(), ["heights"]);
  assert.match(page("?theaters=parkway").status.textContent, /No screenings listed/);
});
