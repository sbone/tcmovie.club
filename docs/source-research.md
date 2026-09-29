# Source inspection — September 29, 2026

This was a bounded inspection, not a crawl or an enabled ingestion job. There is
no network-fetching application code yet. Results describe these sampled responses,
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
  including manual refresh; the published interval takes precedence over our
  generic two-pass-per-day proposal. See [RFC 7986 §5.7](https://www.rfc-editor.org/rfc/rfc7986.html#section-5.7).
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

## Request accounting and evidence

Direct HTTP requests made after the sandbox permitted networking:

| Source | Requests | Paths |
| --- | ---: | --- |
| Trylon | 3 | `/robots.txt`, then user-requested `/` and `/feed/my-calendar-google/`; all 403 |
| Heights | 3 | `/robots.txt`, `/`, `/calendar` |
| Riverview | 3 | `/robots.txt`, `/`, `/show/show/3364` |
| Parkway | 5 | `/robots.txt`, `/`, `/movies`, `/home?format=rss`, `/all-events/poltergeist-26` |

**14 agent-issued direct requests total.** Each URL was fetched once by the agent;
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

## Proposed initial collection policy — not implemented or scheduled

- Start with two passes per day, at least 12 hours apart, per enabled source,
  **except Trylon: at least 24 hours**, per the successfully captured feed.
- Cap each pass at **6 HTTP requests per source**, including robots checks,
  details, and any redirects; maximum **12 per day**. This is a ceiling, not a
  target. Incomplete coverage is a reason to reassess, not silently exceed it.
- One in-flight request per host, at least 10 seconds between requests; no
  immediate retries. Manual refresh shares the same budget/cooldown and is coalesced.
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
