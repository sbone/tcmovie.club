import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { gzipSync } from "node:zlib";
import { load } from "cheerio";
import { venueIdSchema } from "../dist/domain.js";
import { renderDate } from "../dist/site.js";
import { initTheaterMap, mapCenter, mapPoint, theaterLocations, theaterMapPath, theaterMapSvg } from "../dist/theater-map.js";

test("map covers all venues with balanced vertical padding and stays within its budget", () => {
  assert.deepEqual(Object.keys(theaterLocations), venueIdSchema.options);
  const points = Object.values(theaterLocations);
  const xyz = points.reduce((sum, { lat, lon }) => {
    lat *= Math.PI / 180; lon *= Math.PI / 180;
    return [sum[0] + Math.cos(lat) * Math.cos(lon), sum[1] + Math.cos(lat) * Math.sin(lon), sum[2] + Math.sin(lat)];
  }, [0, 0, 0]);
  const latitudes = points.map(point => point.lat);
  assert.equal(mapCenter.lat, (Math.min(...latitudes) + Math.max(...latitudes)) / 2);
  assert.ok(Math.abs(mapCenter.lon - Math.atan2(xyz[1], xyz[0]) * 180 / Math.PI) < 0.000001);
  assert.deepEqual(mapPoint(mapCenter.lat, mapCenter.lon), { x: 360, y: 360 });
  const ys = points.map(point => mapPoint(point.lat, point.lon).y);
  assert.ok(Math.abs(Math.min(...ys) - (720 - Math.max(...ys))) < 0.01,
    "equal map space above Heights and below Parkway");
  for (const { lat, lon } of points) {
    const { x, y } = mapPoint(lat, lon);
    assert.ok(x > 80 && x < 640 && y > 40 && y < 680, "pins fit within padded map bounds");
  }
  assert.ok(gzipSync(theaterMapSvg).length < 50000);
  const svg = load(theaterMapSvg, { xmlMode: true });
  assert.equal(svg("svg").attr("viewBox"), "0 0 720 720");
  assert.equal(svg("image,script,foreignObject").length, 0, "self-contained vector asset");
  for (const layer of ["map-local-roads", "map-roads", "map-highways"]) {
    assert.ok(svg(`#${layer} path`).length > 10, `${layer} has captured road geometry`);
  }
  assert.match(theaterMapSvg, /OpenStreetMap/);
  const $ = load(renderDate("2026-10-13", [], []));
  assert.equal($("#theater-map[open]").length, 0);
  assert.equal($("#theater-map img, #theater-map [src]").length, 0, "no eager image request");
  assert.equal($(".map-frame").attr("data-src"), theaterMapPath);
  assert.deepEqual($(".map-pin").map((_, el) => $(el).attr("data-venue")).get(), venueIdSchema.options);
  assert.equal($(".map-addresses li").length, 7);
  assert.equal($('.map-pin[aria-haspopup="dialog"][aria-controls="map-theater-dialog"]').length, 7);
  assert.equal($("#map-theater-dialog").attr("aria-labelledby"), "map-theater-name");
  for (const point of points) assert.ok($(".map-addresses").text().includes(point.address));
});

function browser(open = false) {
  const element = () => ({ hidden: true, textContent: "", events: {}, addEventListener(name, cb) { this.events[name] = cb; } });
  const frame = { ...element(), dataset: { src: theaterMapPath }, children: [], prepend(image) { this.children.unshift(image); } };
  const status = element(), retry = element();
  const addresses = { ...element(), hidden: false };
  const pins = Object.keys(theaterLocations).map(venue => ({ ...element(), dataset: { venue } }));
  const title = element(), address = element(), link = element();
  const dialog = { open: false, showModal() { this.open = true; }, querySelector: selector => ({ h2: title, p: address, a: link })[selector] };
  const $ = load(renderDate("2026-10-13", [], []));
  const entries = Object.fromEntries(pins.map(pin => {
    const id = `map-address-${pin.dataset.venue}`;
    return [id, { querySelector: selector => selector === "a"
      ? { href: $(`#${id} a`).attr("href"), textContent: $(`#${id} a`).text() }
      : { textContent: $(`#${id} span`).text() } }];
  }));
  const details = { ...element(), open, querySelectorAll: () => pins, querySelector: selector => ({ ".map-frame": frame, ".map-status": status, ".map-retry": retry, ".map-addresses": addresses, dialog })[selector] };
  const requests = [];
  class Image { set src(value) { this.url = value; requests.push(this); } }
  runInNewContext(`(${initTheaterMap.toString()})();`, { document: { querySelector: () => details, getElementById: id => entries[id] }, Image });
  return { details, frame, status, retry, requests, pins, dialog, title, address, addresses, link,
    toggle(value) { details.open = value; details.events.toggle(); } };
}

test("map downloads only on reveal, shares an in-flight request, and reuses the loaded image", () => {
  const p = browser();
  assert.equal(p.requests.length, 0);
  p.toggle(true);
  assert.equal(p.requests.length, 1);
  assert.equal(p.requests[0].url, theaterMapPath);
  assert.equal(p.frame.hidden, true);
  p.toggle(false); p.toggle(true);
  assert.equal(p.requests.length, 1);
  p.requests[0].onload();
  assert.equal(p.frame.hidden, false);
  assert.equal(p.addresses.hidden, true, "loaded map uses dialogs instead of the fallback list");
  assert.equal(p.frame.children.length, 1);
  p.toggle(false); p.toggle(true);
  assert.equal(p.requests.length, 1);
});

test("failed map requests expose retry and addresses; restored open details load too", () => {
  const p = browser(true);
  assert.equal(p.requests.length, 1);
  p.requests[0].onerror();
  assert.equal(p.frame.hidden, true);
  assert.equal(p.retry.hidden, false);
  assert.equal(p.addresses.hidden, false);
  assert.match(p.status.textContent, /addresses are available below/);
  p.retry.events.click();
  assert.equal(p.requests.length, 2);
  assert.equal(p.retry.hidden, true);
  p.requests[1].onload();
  assert.equal(p.frame.hidden, false);
});

test("each theater opens its own name, selectable address text, and website in the dialog", () => {
  const p = browser();
  const websites = new Set();
  for (const pin of p.pins) {
    pin.events.click();
    const location = theaterLocations[pin.dataset.venue];
    assert.equal(p.dialog.open, true);
    assert.equal(p.title.textContent, location.name);
    assert.equal(p.address.textContent, location.address);
    assert.equal(p.link.textContent, p.link.href);
    assert.match(p.link.href, /^https:\/\//);
    websites.add(p.link.href);
  }
  assert.equal(websites.size, 7);
  assert.equal(p.link.href, "https://www.manntheatres.com/?theatre=highland-1-2");
  assert.equal(p.requests.length, 0, "details need no network request");
});
