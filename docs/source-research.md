# Source inspection — September 29, 2026

This was a bounded inspection, not a crawl or an enabled ingestion job. There is
no network-fetching application code at the time of inspection. Results describe these sampled responses,
not guaranteed feeds, complete coverage, or permission from the operators.

## Decisions from this session

- TypeScript, readonly domain records, tagged unions, explicit decoding.
- Include all films at participating venues; preserve special-programming signals.
- Keep members-only screenings visible and explicitly labeled “Members only.”
- Proceed with conservative collection where robots rules and published terms allow it.
- Show ambiguous event starts with “Event starts · film time unconfirmed.”
- Keep recurring Trylon ingestion paused. A follow-up instruction authorized one
  direct homepage inspection despite the earlier robots.txt response. The user
  later supplied a successful calendar response for offline inspection.
- The fetcher identity is deliberately unset for now. A real project URL or contact
  email is needed before recurring collection; offline development can proceed.

## Trylon — structured feed captured locally; recurring collection paused

- [robots.txt](https://www.trylon.org/robots.txt) returned HTTP **403** with a short
  Forbidden response. Initially stopped direct requests there.
- At the user's explicit follow-up request, fetched the [homepage](https://www.trylon.org/)
  once using the same descriptive User-Agent, with no redirects or assets followed.
  It also returned **403**, at `2026-09-29T11:05:57Z`, with a **52-byte body**:
  `403 - Forbidden | Access to this page is forbidden.` No listing HTML, links,
  or structured data were present. Its ETag matched the robots error response.
- This shows the failure is not limited to the robots path for our requests.
  It does **not** establish intent or identify the cause: configuration or request
  filtering remain possible. No user-agent changes, alternate hosts, or bypasses
  were attempted.
- The user subsequently supplied a Google Calendar subscription link whose `cid`
  is `webcal://www.trylon.org/feed/my-calendar-google/`. This identifies a concrete
  calendar-feed candidate rather than a guessed endpoint. One HTTPS request to
  [that exact feed](https://www.trylon.org/feed/my-calendar-google/) returned
  **403** at `2026-09-29T11:10:57Z`, with the same 52-byte error body. No calendar
  content, coverage, timezone fields, or event IDs could be verified. The Google
  subscription action was not opened or submitted. Prefer evaluating this feed
  over HTML parsing when a calendar response becomes available.
- **Subsequent successful local capture:** the user ran a browser-style curl
  request and saved `trylon-calendar.ics` and `trylon-headers.txt` in this project.
  The saved headers show **200**, `text/calendar; charset=UTF-8`, at
  `2026-09-29T11:16:22Z`. I inspected these files offline; no new Trylon request
  was made. The successful response supports request-dependent filtering as a
  possibility, but does not isolate user agent, timing, network, or other factors.
- The **101,061-byte** calendar contains **194 VEVENTs**, all with distinct UIDs,
  titles, locations, start/end fields, categories, and event URLs. **192** name
  Trylon and **2** name Heights. All event starts use `TZID=America/Chicago`.
  No recurrence rules were present; this snapshot already lists occurrences.
- Date coverage is **2026-08-01 through 2027-11-24**, including 184 entries dated
  September 29 onward and 27 within September 29–October 12. The four 2027 entries
  are club screenings. This is the captured range, not verified schedule completeness.
- Both `REFRESH-INTERVAL;VALUE=DURATION:PT1440M` and `X-PUBLISHED-TTL:PT1440M`
  indicate **24 hours**. Use a minimum 24-hour polling interval for Trylon,
  the published interval takes precedence over our two-pass-per-day schedule.
  See [RFC 7986 §5.7](https://www.rfc-editor.org/rfc/rfc7986.html#section-5.7).
- ETag and Last-Modified are present; the latter is `2026-09-28T15:18:01Z`.
  Conditional requests are a candidate, but 304 behavior remains untested.
- **Do not publish the supplied end times as film endings:** all 194 entries
  are exactly **60 minutes**, including Horrorthon. These appear to be placeholder
  durations. Initially normalize `endsAt` to null and retain this diagnostic.
- The embedded VTIMEZONE observances incorrectly mark their 02:00 transition
  timestamps with `Z`. The standard requires local times there. Event DTSTARTs
  themselves use the named Chicago zone. Resolve those against the IANA timezone
  database, with regression cases around DST, instead of trusting the malformed
  embedded transition definitions. See [RFC 5545 §3.6.5](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.6.5).
- Some titles contain format information; categories supply programming signals.
  No STATUS property or sold-out title was found in this capture, so availability
  remains unknown. A ticket-sale event is also present: not every VEVENT is a
  screening. Preserve club-access restrictions rather than presenting those
  events as ordinary public screenings. Unique UIDs in one file are promising
  identity keys, but stability across updates is not yet verified.
- During implementation, the full saved feed was found to contain **no September
  29 screenings and no Je Tu Il Elle entries**, despite those appearing in the
  earlier search-indexed homepage excerpt. This may reflect incomplete or divergent
  source data; the indexed page is not authoritative proof of the current schedule.
  Feed completeness requires reconciliation before treating it as a complete source.
  The offline preview explicitly warns about unverified coverage.
- Search-engine-indexed excerpts of the [homepage](https://www.trylon.org/) show
  dates, multiple showtimes, format/sold-out text, and some events at **Heights**.
  This is indirect evidence, not a captured parser fixture or a live feed verification.
- Keep `sourceId` separate from `venueId`. Cross-listed Heights events will need
  deliberate deduplication when Trylon becomes available.
- **Next:** build and test the adapter against this saved feed offline. A sustainable,
  identified production fetch method remains to be established before enabling
  recurring ingestion. No further probing is needed to develop the parser.

## Heights — straightforward HTML adapter

- [robots.txt](https://www.heightstheater.com/robots.txt) returned **200**. Its
  wildcard rules disallow admin/search/account paths and some infrastructure;
  neither `/` nor `/calendar` is disallowed.
- The [homepage](https://www.heightstheater.com/) returned **200**, approximately
  **133 KB** of HTML containing film titles, event links, showtimes, formats,
  series, and some program notes. It includes `<time datetime="2026-09-29 15:30">`:
  machine-readable wall time, but **no timezone offset**.
- Visible and visually hidden markup duplicate times. Series cards can also
  repeat film listings, and pass purchase entries are not individual screenings.
- The [calendar](https://www.heightstheater.com/calendar) returned **200**, about
  **58 KB**, with the current month and links to adjacent months. At month end it
  cannot alone cover the coming week. The homepage is the better initial fixture;
  its complete future coverage still needs to be established.
- No advertised schedule feed or event JSON-LD was found in these two sampled pages.
  That is not proof the theater has no feed.
- Both pages sent `Cache-Control: must-revalidate, no-cache, private`; no ETag or
  Last-Modified was observed for them. Do not assume conditional HTML requests
  will be available. These headers concern HTTP caching, not scraping permission.
- **Next:** parse saved homepage HTML offline; normalize local times in Chicago,
  deduplicate repeated markup, and link to event pages. `/order/add-tickets/...`
  links look action-oriented: they were not fetched and should not be crawled.

## Riverview — small public HTML, date handling needs care

- [robots.txt](https://www.riverviewtheater.com/robots.txt) returned **200** and
  contains only comments. There are **no active disallow directives** in that response.
- The [homepage](https://www.riverviewtheater.com/) returned **200**, approximately
  **7.6 KB**, with today's schedule, movie links, and dated navigation through the
  following week. Its date links include the year.
- One advertised [film page](https://www.riverviewtheater.com/show/show/3364)
  returned **200**, about **4.5 KB**, with several days of showtimes. The sample
  used text such as weekday/month/day and omitted the year; no machine-readable
  timestamp was found. Year rollover must be resolved against dated source
  context, not the CI machine's clock or an arbitrary current year.
- Both responses supplied ETags. Conditional support is a promising option;
  **304 behavior has not been tested**. The pages also send a private cache policy.
- No feed or event JSON-LD was advertised in the sampled pages.
- **Next:** start with today's page; then compare a bounded number of dated pages
  versus film pages to obtain a future window. One film page does not establish
  that every future movie is discoverable from today's listing. Unknown dates
  must not silently become showtimes.
- **Akira follow-up:** the indexed [film page](https://www.riverviewtheater.com/show/show/3410)
  confirms September 29 and 30 at 4:30 PM, plus a lingering September 27 entry.
  The offline loader now accepts multiple film details. A reduced source-derived
  fixture preserves these three showtime strings; its metadata distinguishes it
  from raw captured HTML. Recent past dates resolve within the preceding week;
  future dates still require dated navigation. No direct HTTP request was added.

## Parkway — HTML works; event time is not necessarily film time

- [robots.txt](https://theparkwaytheater.com/robots.txt) returned **200**. Its
  wildcard group explicitly disallows `/api/` (apart from the stated UI extension
  exception), several query filters, `?format=json`, `?format=json-pretty`, and
  **`?format=ical`** (also `&format=...` forms). None of these were requested.
- The [homepage](https://theparkwaytheater.com/) and
  [Movies page](https://theparkwaytheater.com/movies) returned **200**. Movies is
  approximately **204 KB** of HTML with dates, titles, event links, and time ranges.
  It also includes an all-movie pass, so membership in Movies is not sufficient
  evidence of an individual screening.
- The homepage advertises [an RSS feed](https://theparkwaytheater.com/home?format=rss).
  RSS is not disallowed by the inspected rules. One request returned valid RSS
  with **zero items**; it is not a usable schedule on this evidence. No other
  feed endpoints were guessed or probed.
- One linked [Poltergeist event](https://theparkwaytheater.com/all-events/poltergeist-26)
  includes Event JSON-LD with a 19:00 start and 22:00 end, using a `-0500` offset.
  Its visible schedule explicitly distinguishes **19:00 doors/DJ** from
  **20:00 movie**. Normalize compact offsets before domain decoding. The JSON-LD
  alone would put the movie an hour early. Do not infer film end from event end.
- The event advertises ICS, but the robots restriction still applies: **not fetched**.
- ETags were observed on the listing pages and RSS response; 304 behavior was
  not tested. No ticket vendor, checkout, image, JavaScript, or CSS was fetched.
- **Next:** parse the Movies listing and selected event pages with a strict
  request budget. Prefer explicit film/program times. When only event time is
  known, preserve that uncertainty in the domain and in the rendered label.

## Initial request accounting and evidence

Direct HTTP requests made after the sandbox permitted networking:

| Source | Requests | Paths |
| --- | ---: | --- |
| Trylon | 3 | `/robots.txt`, then user-requested `/` and `/feed/my-calendar-google/`; all 403 |
| Heights | 3 | `/robots.txt`, `/`, `/calendar` |
| Riverview | 3 | `/robots.txt`, `/`, `/show/show/3364` |
| Parkway | 5 | `/robots.txt`, `/`, `/movies`, `/home?format=rss`, `/all-events/poltergeist-26` |

**14 agent-issued direct requests in the initial inspection.** Each URL was fetched once by the agent;
none redirected. The later successful user-supplied feed capture is recorded
separately and was not fetched again by the agent. The first
robots batch issued one request per host. Later requests to the same host were
separated by offline inspection. There were no retries, pagination sweeps, asset
downloads, form submissions, or ticketing requests.

Before that, the web reader attempted the four robots URLs but could not retrieve
them; its underlying request count is not exposed. Search queries supplied indexed
context. Initial sandboxed curl requests failed DNS. Thus 14 is the count of our
network-enabled curl attempts, including three 403 responses, not a claim about all
upstream activity by the search/web service.

The research User-Agent was
`tc-movie-cal/0.1 (manual source research; no scheduled crawling)`.
It did not pretend to be a browser. A production identity needs a real contact URL
or email. Bodies and safe response metadata are retained locally in
`.research/2026-09-29/`; response cookies are not retained in the manifest.

## Offline coverage follow-up

The reviewed preview spans **September 29–October 12, 2026**. All generation and
tests still run offline; no recurring collector has been enabled.

| Source | Inputs added or reconciled | Result |
| --- | --- | --- |
| Trylon | Indexed official homepage and three film pages; original ICS retained unchanged. | Two September 29 Je Tu Il Elle showings, Season of the Witch's sold-out status, and Friday Horrorthon restored. All three Horrorthon sessions have explicit program ending times. 30 showings in the preview before cross-source deduplication. |
| Heights | Previously saved September calendar and one linked October calendar capture. | 38 total showings, 30 in the preview. Calendar adds films/dates omitted from the homepage, including Parasite and Babylon in 70mm. Stable ticket IDs deduplicate overlapping markup; missing DCP metadata is filled from the homepage. |
| Riverview | September 30, October 1, October 2 daily pages and Special Screenings. | Regular listings through October 1 and They're Here on October 7 at 5:45 PM: 9 preview showings. October 2 explicitly says scheduling is pending; that is not a broken parser or proof that subsequent dates are empty. Other timed specials remain in the full index. Canoe Dig It? lacks a clock time and is reported without inventing one. |
| Parkway | All six remaining event detail pages in the preview; existing Poltergeist retained. | 8 preview showings across 7 events. HUMP has two sessions; explicit film/program starts and doors times are parsed separately. Later uninspected event dates retain uncertain start labels. |

After removing cross-listed Heights duplicates, the preview has **76 showings**;
the full saved index has **261**. Titles differing only by an explicit format
suffix such as “in 4K” match at the same venue and instant. The venue's own link
wins, while known format and membership information survive.

Trylon's [Je Tu Il Elle film page](https://www.trylon.org/film/je-tu-il-elle/)
explicitly lists dated September 29 ticket sessions. The
[Season of the Witch page](https://www.trylon.org/film/season-of-the-witch-in-35mm/)
and homepage corroborate sold-out status. The
[Horrorthon page](https://www.trylon.org/film/horrorthon-x/) gives three program
sessions, including Friday, October 9, 4 PM–midnight, absent from the feed and
homepage widget. The Saturday sessions run 10 AM–6 PM and 8 PM–4 AM the following
day. These corrections are validated normalized offline records in
`test/fixtures/trylon/reviewed.json`, with separate indexed-page provenance. They
do not modify the raw ICS and are **not** a production collection mechanism.
Cached text is not proof of current availability; the page remains marked stale.
No new direct Trylon request, retry, identity change, or bypass was made.

This follow-up added **11 direct HTTP requests**: Heights 1, Riverview 4, Parkway 6.
All returned 200, each URL was requested once, and same-host requests were spaced
by offline work. No redirects, assets, forms, or ticket vendors were followed.
The network-enabled direct-request total is now **25** (initial 14 plus 11).
Separately, the web reader opened Trylon's homepage/three film pages and Riverview's
October 2 page; its underlying upstream traffic is not exposed. The previous
Akira indexed-page inspection is recorded in its fixture metadata.

New Parkway detail fixtures are small DOM excerpts containing the original date
and schedule paragraphs. Full raw responses and safe request metadata remain in
local `.research/2026-09-29/`. Their parser output was verified identical before
reducing the fixtures. Other newly committed HTML is sanitized captured markup.
Capture timestamps stay conservative; indexed supplements have no fabricated HTTP
Date, and replaying the inputs never marks them fresh.

## Initial collection policy — collector implemented, not scheduled

The collector now implements these limits; see [setup](../README.md#collector).
Trylon remains disabled by default. Automated verification uses simulated HTTP
responses, not new theater requests. This document's source observations remain
the historical evidence from the inspection above.

- Run one server job at **7 AM and 7 PM America/Chicago**, using local timezone
  scheduling rather than fixed UTC hours. **Trylon: morning only, at least 24 hours
  since the previous request**, per the successfully captured feed. The elapsed
  interval guard still applies across daylight saving changes and delayed runs.
- Publish static HTML/JSON with source timestamps after collection. Visitor
  requests serve static files and never trigger upstream requests. No manual
  refresh action, API, or visitor-triggered ingestion.
- Cap each pass at **6 HTTP requests per source**, including robots checks,
  details, and any redirects; maximum **12 per day**. This is a ceiling, not a
  target. Incomplete coverage is a reason to reassess, not silently exceed it.
- One in-flight request per host, at least 10 seconds between requests; no
  immediate retries. Failures wait for a later scheduled run, honoring longer backoff.
- Recheck robots daily; respect more restrictive source rules. An unreadable or
  denied robots response pauses ingestion pending review.
- Check discovered redirects before following them; a new origin needs its own
  rules review. Never carry credentials or cookies between origins.
- Send conditional requests when validators are available. On 401/403, stop for
  review. On 429, honor Retry-After and back off; on network/5xx errors, back off
  conservatively. Bound response size and time. Keep last-known-good data.
- No full-site traversal, speculative feed/API probes, ticket-vendor crawling,
  headless browser, or anti-bot bypass. Public links can go straight to venue pages.
- Store factual screening data; do not publish venue descriptions or images.

No relevant terms/feed-policy link was identified in the sampled listing markup;
**a complete published-terms review remains outstanding**. Robots rules are crawl
directives, not affirmative operator permission. Before enabling recurring
collection, finish that review and configure the contact identity. Ask the venue
when the permitted method or timing semantics remain unclear.

## Next-venue survey — September 29, 2026

These are candidates from the project brief, not enabled sources. Only The Main
received direct requests: four total, one each for `/robots.txt`, `/showtimes/`,
the RSS URL advertised by that page, and one linked film page. Requests used
`tc-movie-cal/0.1 (+https://tcmovie.club)`, no cookies, no assets, and no retries.
The raw responses are in ignored `.research/2026-09-29/main/`. Web search/reader
traffic is separate and its upstream request count is unknown.

| Candidate | Evidence | Decision |
| --- | --- | --- |
| [The Main Cinema / MSP Film](https://mspfilm.org/showtimes/) | [Robots](https://mspfilm.org/robots.txt) returned 200 with no disallowed paths. Its advertised [RSS feed](https://mspfilm.org/feed/) returned 200 but zero items. The 190 KB showtimes HTML contained structured data for six films and nine September 29 showings, all on that one date. One linked [film page](https://mspfilm.org/show/hope/) contained three dated showtimes through October 1. An indexed showtimes page also listed a Walker Cinema event, so the listing alone cannot establish that every event is at The Main. No clear schedule feed or complete 14-day discovery path was identified; no published automation terms were found in the sampled pages/search. | Keep as a research snapshot. A live adapter would need dependable future-date discovery and venue identification, with a coverage warning when either is missing. |
| [Landmark Lagoon Cinema](https://www.landmarktheatres.com/theaters/x01qw-landmark-lagoon-cinema-minneapolis/) | [Landmark's terms](https://www.landmarktheatres.com/terms/) explicitly restrict extracting site data with robots/scrapers and require written permission for other material use. No authorized showtime feed was identified. | No direct request, snapshot, or adapter. Ask for permission or an approved feed before collection. |
| [Emagine Willow Creek](https://www.emagine-entertainment.com/theatres/emagine-willow-creek/) | [Emagine's terms](https://www.emagine-entertainment.com/terms-and-conditions/) restrict crawling/scraping and publishing its content. Its public theater page lists films, and [Cinema of the Macabre](https://www.emagine-entertainment.com/macabre/) is a Willow Creek program, but no authorized schedule feed was identified. | No direct request, snapshot, or adapter. Ask for permission or an approved feed before collection. |

The Main snapshot is enough to test a same-day parser, but not enough to add a
production adapter under the project's all-films, 14-day coverage goal. No new
source is wired into the collector or published site.

### The Main calendar follow-up — same day

The user identified the exact request made by the site's month calendar:
[`calendar-events?start_date=2026-10-01&end_date=2026-11-01&_locale=user`](https://mspfilm.org/wp-json/gecko-theme/v1/calendar-events?start_date=2026-10-01&end_date=2026-11-01&_locale=user).
One direct request returned 200 JSON with 185 events. A second, deliberately
built [14-day request](https://mspfilm.org/wp-json/gecko-theme/v1/calendar-events?start_date=2026-09-29&end_date=2026-10-13&_locale=user)
returned 199 events dated September 29–October 12; all 170 event IDs in the
overlapping October 1–12 range matched the month response. The exclusive
`end_date` is confirmed by October 13 events present in the month response but
absent from the 14-day response. This makes one bounded calendar request per
refresh practical, without traversing individual film pages.

The response includes stable numeric `event_id`, title, film permalink, date,
displayed `start_time`, and event venue. Five of the 199 window events name
Capri Theater, Minneapolis Institute of Art, or Aster River Room rather than
The Main's Theater 1–5; the adapter excludes them. An October 13 book launch
also uses Theater 3 and is explicitly excluded. Other non-film event types may
need further review as schedules change. The API's `start` values carry `+00:00`
but often use the displayed local clock hour (for example, 1:00 PM is encoded
as `13:00+00:00`). Interpreting them as instants would be five hours early.
The adapter instead combines the calendar date and displayed time with
America/Chicago, rejecting invalid or ambiguous wall times. The API's `end`
is not used to infer a film end.

The reduced, description-free 14-day fixture is committed under
`test/fixtures/main/`; full responses are retained only in ignored
`.research/2026-09-29/main/`. Parsing the reduced and full window responses
produced identical screening records and diagnostics. The new adapter is wired
to offline generation and to the **unscheduled** collector, which retains the
same per-source request limits and daily robots check. No live recurring job or
deployment was enabled. This adds **two direct Main requests** beyond the four
in the initial survey (six total); there were no retries or asset requests.
