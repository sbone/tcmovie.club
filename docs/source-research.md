# Source research and capture provenance

These are dated observations from bounded inspections, not guarantees of current
access or schedule completeness. Collection behavior and scheduling are documented
in the [development guide](development.md); parser contracts and fixture limits
are in the [source adapter table](../src/sources/README.md). Raw responses remain
in ignored local research/state directories; fixture metadata records provenance.
Git history retains the original inspection narrative.

## Trylon — September 29, 2026

Initial identified requests to [robots.txt](https://www.trylon.org/robots.txt),
the homepage, and the advertised [calendar feed](https://www.trylon.org/feed/my-calendar-google/)
returned 403 with identical 52-byte bodies. A later user-supplied local capture
returned 200 `text/calendar` at `2026-09-29T11:16:22Z`. This suggested
request-dependent filtering but did not establish its cause. No bypass was added.
A subsequent local robots check with `tc-movie-cal/0.1 (+https://tcmovie.club)`
succeeded and did not disallow the feed; the feed was not fetched again because
its last capture was less than 24 hours old.

The captured calendar has 194 VEVENTs with distinct UIDs: 192 at Trylon and two
at Heights, dated August 1, 2026–November 24, 2027. Its published refresh interval
is 24 hours ([RFC 7986 §5.7](https://www.rfc-editor.org/rfc/rfc7986.html#section-5.7));
the collection interval was later changed as recorded below. ETag and
Last-Modified were present; the initial inspection did not test 304 behavior.

Parser decisions supported by this capture:

- All supplied end times are exactly 60 minutes, including Horrorthon; omit these
  placeholder endings rather than treating them as film durations.
- Embedded VTIMEZONE transition timestamps incorrectly carry `Z`. Resolve event
  DTSTARTs against the named Chicago IANA zone instead
  ([RFC 5545 §3.6.5](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.6.5)).
- Exclude the ticket-sale event; preserve club membership restrictions and
  cross-listed Heights identities.
- The feed lacks September 29 screenings and Je Tu Il Elle despite indexed
  official pages listing them. Feed coverage must remain qualified.

Offline reviewed corrections restore two September 29 Je Tu Il Elle showings,
Season of the Witch's sold-out status, and all three Horrorthon sessions with
explicit program endings. Evidence came from indexed official
[Je Tu Il Elle](https://www.trylon.org/film/je-tu-il-elle/),
[Season of the Witch](https://www.trylon.org/film/season-of-the-witch-in-35mm/), and
[Horrorthon](https://www.trylon.org/film/horrorthon-x/) pages. These records live
in `test/fixtures/trylon/reviewed.json` with separate metadata. They never modify
the raw feed or enter live ingestion; indexed evidence does not prove current
availability. The raw feed remains unchanged.

### Trylon interval update — October 6, 2026

The user authorized reducing the minimum interval to 12 elapsed hours, including
a manual refresh followed about 13 hours later by the 12:30 AM scheduled run.
This supersedes the original 24-hour polling policy. The feed metadata remains
unchanged. The scheduled refresh still runs once daily; request windows, budgets,
robots checks, access pauses, conditional requests, and backoff remain in force.
No theater requests were made to change this policy.

## Heights — September 29, 2026

[Robots](https://www.heightstheater.com/robots.txt) returned 200 and did not disallow
`/` or `/calendar`. The homepage supplied titles, ticket IDs, wall times, formats,
and series; the September calendar linked October. Both months are captured.
Local times have no offset and resolve in Chicago.

Visible/hidden duplicate times, overlapping homepage/calendar entries, and pass
purchase entries require deduplication or exclusion. Missing DCP values can be
filled from explicit homepage evidence, but conflicting facts reject an import.
Ticket action paths were not fetched. The sampled pages had private/no-cache
headers and no observed ETag or Last-Modified; caching headers do not establish
collection permission.

### Heights parser recovery — October 13, 2026

Saved production responses exposed two parser failures: the homepage's
`showtime view-all` navigation row was treated as a screening, and calendar
showings with external ticket links had no internal numeric ticket ID.
Reduced October 8/13 captures in `test/fixtures/heights/regressions/` preserve
the Ueck and History of Concrete navigation rows, Silver Screamers' external
registration link, and Houdini 100's multiple externally ticketed sessions.

The parser excludes the explicit navigation row and identifies external-ticket
sessions by film path and resolved start time, consistently across homepage and
calendar. It retains external links without requesting them. Missing times,
broken internal ticket IDs, and conflicting duplicates still reject an import.
These fixes were checked by replaying saved responses; replay preserves their
original timestamps and does not establish current source access.

A subsequent user-authorized Heights-only check fetched the homepage and calendar
with the existing HTTP client, reusing today's robots check and recording both
requests against the live budget. Both returned 200. The candidate accepted 31
screenings with a conservative response timestamp of `2026-10-13T13:35:18Z`;
all 14 generated preview pages passed smoke checks. Candidate data and responses
were saved under ignored `.state/previews/`. Live accepted listings, retry backoff,
and the deployed site were not replaced during this check.

## Riverview — September 29, 2026

[Robots](https://www.riverviewtheater.com/robots.txt) returned 200 with comments
and no active disallow rules. The homepage had dated navigation including years;
a film detail page omitted years. Yearless dates must resolve against source
context, including rollover, rather than the machine's current year. ETags were
present; the initial inspection did not test 304 behavior.

Captures cover September 29–October 1 daily listings and Special Screenings.
October 2 explicitly says scheduling is pending, which does not prove later dates
are empty. They're Here is confirmed for October 7 at 5:45 PM; Canoe Dig It? lacks
a clock time and remains a diagnostic. The reduced Akira fixture is derived from
indexed official film-page evidence, rather than a raw HTTP response; its metadata
records that distinction. Live collection uses dated pages and specials, without
needing the yearless film detail fixtures.

## Parkway — September 29, 2026

[Robots](https://theparkwaytheater.com/robots.txt) returned 200 and disallowed
`/api/` (apart from a stated UI extension exception), query filters, and JSON/ICS
format variants. None of those endpoints were requested. The Movies page and six
additional detail captures complement the original Poltergeist detail. The
advertised RSS feed returned valid XML with zero items.

Poltergeist's JSON-LD start was 7 PM, but the visible schedule explicitly said
7 PM doors/DJ and 8 PM movie. Prefer explicit film/program starts and preserve
uncertain event starts when those are unavailable. HUMP has two separately paired
doors/show sessions. Exclude multi-event passes; do not infer movie endings from
event end times. ETags were observed, but initial 304 behavior was untested.
Reduced detail fixtures preserve date/schedule markup; full and reduced parser
outputs were checked to match. No ticket vendors or assets were fetched.

## The Main Cinema — September 29, 2026

[Robots](https://mspfilm.org/robots.txt) returned 200 with no disallowed paths.
The initial showtimes HTML only covered one date and the RSS feed had zero items.
The user then identified the site's calendar JSON request. A month response had
185 events; a [14-day response](https://mspfilm.org/wp-json/gecko-theme/v1/calendar-events?start_date=2026-09-29&end_date=2026-10-13&_locale=user)
had 199 events for September 29–October 12. All 170 IDs in the overlapping October
1–12 range matched. October 13's absence confirmed an exclusive `end_date`.

Only Theater 1–5 events belong to The Main: five window events at Capri, MIA, or
Aster River Room are excluded, leaving 194 screenings. An October 13 book launch
at Theater 3 is also explicitly excluded. Other event types may need review.
The API's UTC `start` values disagree with displayed clock times, so the parser
combines `date` and `start_time` in Chicago and rejects ambiguous/invalid times.
API `end` values do not establish film endings.

The reduced, description-free fixture produced the same records/diagnostics as
the full response. Full captures remain in `.research/2026-09-29/main/`.

## Mann Grandview and Highland — October 12, 2026

Both venues use server-rendered `/?theatre=<slug>&day=<offset>` HTML and share a
parser. Only bookable Now playing cards become screenings; Rewind promotion tiles
are excluded. Booking IDs provide stable identities and direct ticket links.

The initial Grandview day=2 fixture is a reduced extract from user-supplied HTML.
Later live acquisition used the existing robots-aware HTTP client with
`https://tcmovie.club` as contact and captured five Grandview date pages and three
Highland date pages. The observed picker offered October 12–18, with some dates
unavailable. That does not establish a fixed seven-day publication policy or
complete coverage; request budgets also limit fetched dates.

The live check found that Today/Tomorrow labels need the selected date picker
button to verify the expected month/day. Reduced real Highland captures for
October 12–14 now cover those labels and a fully dated label. Tests reject wrong
dates, wrong theaters, and missing selection. Both sources share request spacing
and run sequentially on the Mann host; each retains its per-source budget.

After correction, captured responses were replayed without further requests
through collection, acceptance/storage, and page generation. All eight pages
parsed without invalid records, accepting 14 Grandview and 12 Highland screenings
and generating a 14-day preview. This verifies captured inputs, not a complete
14-day schedule or production deployment. Full responses and replay output remain
in ignored `.state/mann-verification/`. The full offline suite passed 60 tests
on October 12, including after the compact mobile filters were added.

## Other candidates — September 29, 2026

- **Landmark Lagoon:** inspected [terms](https://www.landmarktheatres.com/terms/)
  restricted extraction by robots/scrapers;
  no approved feed was identified. No direct request, fixture, or adapter added.
- **Emagine Willow Creek:** inspected [terms](https://www.emagine-entertainment.com/terms-and-conditions/)
  restricted crawling/scraping and
  content publication; no approved feed was identified. No direct request,
  fixture, or adapter added.

Those are historical findings. Recheck permitted access and feed options before
adding either source; the original survey is retained in Git history.

## Historical request accounting and collection constraints

The September 29 initial inspection issued 14 network-enabled direct requests:
Trylon 3, Heights 3, Riverview 3, Parkway 5. The coverage follow-up added 11:
Heights 1, Riverview 4, Parkway 6. The Main survey/calendar follow-up added six,
and the later Trylon robots check added one. The user-supplied successful Trylon
feed capture and search/web-reader traffic are separate; reader upstream counts
were not exposed. Initial sandbox DNS failures are not successful HTTP captures.

These totals describe those inspections, not cumulative collector traffic. Current
runs persist their request counts in HTTP state and automatic refresh reports.
No assets, form submissions, ticket vendors, or speculative feed endpoints were
included. Historical counts and capture metadata should not be treated as proof
of present access.

A complete published-terms review was not established by the original inspection.
Robots directives do not constitute affirmative operator permission. Retain the
identified client, bounded discovery, daily robots checks, access pauses, backoff,
and last-good fallback described in the development guide. Visitors only receive
static output and never trigger theater requests.
