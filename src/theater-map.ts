import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { VenueId } from "./domain.js";

// Verified coordinates and provenance: docs/theater-locations.md.
export const theaterLocations = {
  trylon: { name: "Trylon Cinema", lat: 44.943185, lon: -93.231029, address: "2820 E 33rd St, Minneapolis, MN" },
  heights: { name: "Heights Theater", lat: 45.039779, lon: -93.246892, address: "3951 Central Ave NE, Columbia Heights, MN" },
  parkway: { name: "The Parkway Theater", lat: 44.915613, lon: -93.263014, address: "4814 Chicago Ave S, Minneapolis, MN" },
  riverview: { name: "Riverview Theater", lat: 44.934070, lon: -93.213148, address: "3800 42nd Ave S, Minneapolis, MN" },
  main: { name: "The Main Cinema", lat: 44.984705, lon: -93.255598, address: "115 SE Main St, Minneapolis, MN" },
  grandview: { name: "Mann Grandview 1 & 2", lat: 44.939817, lon: -93.177793, address: "1830 Grand Ave, Saint Paul, MN" },
  highland: { name: "Mann Highland 1 & 2", lat: 44.918421, lon: -93.187177, address: "760 Cleveland Ave S, Saint Paul, MN" },
} as const satisfies Record<VenueId, { name: string; lat: number; lon: number; address: string }>;

// Keep geographic-center longitude; balance vertical padding between Heights and Parkway.
// Local equirectangular projection, shared with the stored 720 × 720 basemap.
export const mapCenter = { lat: 44.977696, lon: -93.224941 };
export function mapPoint(lat: number, lon: number) {
  return { x: 360 + (lon - mapCenter.lon) * 3650 * Math.cos(mapCenter.lat * Math.PI / 180),
    y: 360 - (lat - mapCenter.lat) * 3650 };
}
export const theaterMapSvg = readFileSync(new URL("../assets/theater-map.svg", import.meta.url), "utf8");
export const theaterMapPath = `/maps/theaters-${createHash("sha256").update(theaterMapSvg).digest("hex").slice(0, 12)}.svg`;

// Embedded in the page: no imports or network activity until the details opens.
export function initTheaterMap() {
  const details = document.querySelector<HTMLDetailsElement>("#theater-map")!;
  const frame = details.querySelector<HTMLElement>(".map-frame")!;
  const status = details.querySelector<HTMLElement>(".map-status")!;
  const retry = details.querySelector<HTMLButtonElement>(".map-retry")!;
  const addresses = details.querySelector<HTMLElement>(".map-addresses")!;
  const dialog = details.querySelector<HTMLDialogElement>("dialog")!;
  for (const pin of details.querySelectorAll<HTMLButtonElement>(".map-pin")) {
    pin.addEventListener("click", () => {
      const entry = document.getElementById(`map-address-${pin.dataset.venue}`)!;
      const website = entry.querySelector<HTMLAnchorElement>("a")!;
      dialog.querySelector("h2")!.textContent = website.textContent;
      dialog.querySelector("p")!.textContent = entry.querySelector("span")!.textContent;
      const link = dialog.querySelector("a")!;
      link.href = website.href;
      link.textContent = website.href;
      dialog.showModal();
    });
  }
  let image: HTMLImageElement | undefined;
  const load = () => {
    if (image) return;
    image = new Image();
    image.alt = "Twin Cities roads, highways, and Mississippi River. Select a theater marker for its address and website.";
    image.width = 720;
    image.height = 720;
    image.decoding = "async";
    status.textContent = "Loading theater map… Addresses are available below.";
    retry.hidden = true;
    image.onload = () => {
      frame.prepend(image!);
      frame.hidden = false;
      addresses.hidden = true;
      status.textContent = "All seven theaters. Dimmed names are excluded by your filters.";
    };
    image.onerror = () => {
      image = undefined;
      status.textContent = "Map couldn’t load. Theater addresses are available below.";
      retry.hidden = false;
    };
    image.src = frame.dataset.src!;
  };
  details.addEventListener("toggle", () => { if (details.open) load(); });
  retry.addEventListener("click", load);
  if (details.open) load();
}
