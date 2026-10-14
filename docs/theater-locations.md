# Theater locations for the optional map

Location reference for the seven theaters supported by tcmovie.club, checked on
**October 13, 2026**. Use these stored coordinates to generate the optional map
offline; page views and routine builds should not geocode theater addresses.

## Locations

Coordinates are **WGS 84 decimal degrees**, explicitly **latitude, longitude**.
Negative longitudes mean west. These are venue markers, not surveyed entrances,
parking locations, or accessible drop-off points. Six decimal places preserve
the captured position; they do not imply survey accuracy.

| Project ID | Theater | Street address | Latitude | Longitude | Coordinate source |
| --- | --- | --- | ---: | ---: | --- |
| `trylon` | Trylon Cinema | 2820 E 33rd St, Minneapolis, MN | 44.943185 | -93.231029 | [OSM node 2276471606](https://www.openstreetmap.org/node/2276471606), version 6 |
| `heights` | Heights Theater | 3951 Central Ave NE, Columbia Heights, MN | 45.039779 | -93.246892 | [OSM way 736541328](https://www.openstreetmap.org/way/736541328), version 4 |
| `parkway` | The Parkway Theater | 4814 Chicago Ave S, Minneapolis, MN | 44.915613 | -93.263014 | [OSM way 275333467](https://www.openstreetmap.org/way/275333467), version 7 |
| `riverview` | Riverview Theater | 3800 42nd Ave S, Minneapolis, MN | 44.934070 | -93.213148 | [OSM way 61133375](https://www.openstreetmap.org/way/61133375), version 6 |
| `main` | The Main Cinema | 115 SE Main St, Minneapolis, MN | 44.984705 | -93.255598 | [OSM node 1077152679](https://www.openstreetmap.org/node/1077152679), version 11 |
| `grandview` | Mann Grandview 1 & 2 | 1830 Grand Ave, Saint Paul, MN | 44.939817 | -93.177793 | [OSM way 141425766](https://www.openstreetmap.org/way/141425766), version 7 |
| `highland` | Mann Highland 1 & 2 | 760 Cleveland Ave S, Saint Paul, MN | 44.918421 | -93.187177 | [OSM node 560483837](https://www.openstreetmap.org/node/560483837), version 3 |

Node coordinates come directly from the OpenStreetMap API. For the four building
ways, the marker is the midpoint of the footprint's minimum/maximum latitude and
longitude, calculated from its constituent nodes. This is a bounding-box center,
not a polygon centroid. Values above are rounded to six decimal places.

Addresses were matched to the corresponding OSM cinema records. Operator
references also confirm [Trylon's 33rd Street address](https://www.trylon.org/mc-locations/the-trylon-cinema/),
[The Main's cinema address](https://mspfilm.org/contact/), and
[both Mann addresses](https://www.manntheatres.com/theatres).
The Main's **125 SE Main Street** address is the Film Society office; use **115**
for the cinema marker and visitor address. For Trylon, use the current **2820 E
33rd Street** visitor address rather than older Minnehaha Avenue listings.

## Center and bounds

The equal-weight spherical center of the seven stored markers is:

- **Latitude:** `44.953660`
- **Longitude:** `-93.224941`
- **MapLibre / Mapbox center order:** `[-93.224941, 44.953660]`

Calculated by converting each latitude/longitude pair to a three-dimensional
unit vector, averaging the seven vectors, and converting the result back to
latitude/longitude. Each theater counts once, regardless of its number of screens
or screenings. Recalculate only when the location set changes.

The unpadded marker bounds are:

```json
{
  "west": -93.263014,
  "south": 44.915613,
  "east": -93.177793,
  "north": 45.039779
}
```

GeoJSON coordinates use **[longitude, latitude]**, and its bounding-box order is
**[west, south, east, north]**. Leaflet latitude/longitude arrays use the reverse
coordinate order. Keep the named fields until passing values to a map API.

The displayed map uses **latitude `44.977696`, longitude `-93.224941`** as its
viewport center. It keeps the geographic-center longitude and centers vertically
between the northernmost marker (Heights) and southernmost marker (Parkway).
This gives both ends equal padding in the square map. The geographic center above
remains a reference value. Theater filters highlight markers without changing
the viewport.

## Map implementation constraints

The implemented approach is a prebuilt map loaded only when the visitor selects
**Show theater map**. Reuse one versioned asset across date pages; no mapping
library, map-image download, tile request, or geocoding request before that click.
Generation enforces a map-asset budget of **50 KB gzip**.
Keep theater addresses available as text if the asset cannot load.

The coordinate records are implemented in [theater-map.ts](../src/theater-map.ts).
Keep them and this table in sync. Markers use HTML buttons above the stored SVG;
selecting one opens a native dialog with a selectable address and website URL.

## Stored basemap

[assets/theater-map.svg](../assets/theater-map.svg) is the committed basemap source.
No basemap queries run during builds or page views. The October 13, 2026 extract
combines:

- OpenStreetMap river geometry, retrieved through the public
  [Overpass endpoint](https://maps.mail.ru/osm/tools/overpass/api/interpreter).
  Query: `way[waterway=river](44.85,-93.35,45.06,-93.10); out geom;`, with JSON
  output. The rendered selection is the Mississippi River, its east channel,
  Minnesota River, and Minnehaha Creek. Widths are illustrative centerlines.
- [U.S. Census Bureau TIGERweb Transportation](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer):
  layers 2 (primary roads), 5 (secondary roads), and 7 (selected local roads).
  GeoJSON queries use the envelope `[-93.365, 44.844, -93.085, 45.064]`, with
  input/output spatial reference EPSG:4326. Local roads select these `BASENAME`
  values: Lake, Grand, Cleveland, Chicago, Ford, Marshall, Franklin, Hennepin,
  Nicollet, Minnehaha, 42nd, 33rd, Penn, Portland, Cedar, Lyndale, Broadway, Lowry,
  46th, 50th, 38th, University, Snelling, Lexington, Dale, and Fairview.

The 720 × 720 SVG uses a local equirectangular projection about the viewport center:

```text
x = 360 + (longitude - centerLongitude) × 3650 × cos(centerLatitude in radians)
y = 360 - (latitude - centerLatitude) × 3650
```

Road geometry is clipped to the image plus a five-pixel margin, simplified with
a 0.7-pixel tolerance, and rounded to tenths of pixels. Highway labels sit on
captured geometry; city labels are for orientation. This is a location overview,
not a navigation map. Its first road-inclusive version is about **14 KB gzip**.
Keep the SVG projection and `mapPoint()` synchronized when changing the framing.
Waterway attribution and Census credit appear alongside the map.

## Provenance and maintenance

Primary API responses were retrieved from `api.openstreetmap.org/api/0.6/` using
the node and way IDs above. Raw JSON is retained locally in ignored
`.research/2026-10-13/theater-locations/`; this document contains the values needed
to reuse the locations without those local files or further queries.
Basemap research captures and the one-time export script remain locally in
`.research/2026-10-13/theater-map/`; the committed SVG is sufficient to rebuild
and serve the map without that directory.

Location data: **© OpenStreetMap contributors**, available under the
[Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).
Preserve attribution in the eventual map; see the
[OpenStreetMap attribution guidance](https://www.openstreetmap.org/copyright).

When a theater moves, a marker is corrected, or the supported theater set changes,
update its row, source version, and verification date; recalculate the center and
bounds and regenerate the map asset. Routine schedule refreshes should leave
these locations alone.
