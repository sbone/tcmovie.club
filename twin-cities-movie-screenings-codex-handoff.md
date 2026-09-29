# Twin Cities Movie Screenings — Codex Handoff

## Product

Build a very fast, mobile-first web index of interesting Twin Cities theatrical screenings.

The problem is simple: the Twin Cities has unusually good repertory, independent, revival, and special-event movie programming, but discovering what is playing requires checking many theater sites separately.

This site should answer:

> **I have some time. What interesting movie can I go see?**

It is **not** intended to become another general movie database, recommendation engine, social network, or ticket marketplace.

Initial sources of interest:

- Trylon Cinema
- Heights Theater
- The Parkway Theater
- Riverview Theater
- The Main Cinema / MSP Film
- Lagoon Cinema / Landmark
- Emagine Willow Creek, especially curated/themed programming

Start with the easiest/highest-value subset rather than integrating everything at once. A good V0 is likely:

1. Trylon
2. Heights
3. Parkway
4. Riverview

Add the others after the ingestion architecture is proven.

---

## Core product principles

### 1. The schedule is the product

Everything between tapping the site and seeing screenings is overhead.

The default view should immediately show useful screenings, ordered chronologically.

Avoid splash screens, dashboards, poster grids, carousels, maps, mandatory search, accounts, and other UI that delays the answer.

### 2. Mobile web first

The motivating scenario:

> Bored waiting for a bus, two bars of cellular service, wondering what is playing tonight.

Optimize for that situation.

Desktop should work well, but mobile is the primary environment.

### 3. Fast under hostile network conditions

Treat bad connectivity as a design constraint, not a later optimization.

Initial useful content should ideally arrive in the first HTML response.

Suggested performance budget:

- initial HTML: < 25 KB compressed where practical
- CSS: < 10 KB compressed
- JS: < 15 KB compressed
- no webfonts
- no movie posters in the primary schedule
- no third-party JS
- no runtime requests to theater websites
- useful content with JavaScript disabled
- CDN-cacheable output

These are goals, not reasons for unreadable code.

### 4. Mostly static

The public request path should not scrape or query theater sites.

Preferred flow:

```text
theater sites
    ↓
scheduled ingestion
    ↓
source adapters
    ↓
normalized screening records
    ↓
validation / deduplication
    ↓
static generation
    ↓
CDN
    ↓
browser
```

Generate useful HTML ahead of time.

Possible output:

```text
/
/2026-09-30/
/2026-10-01/
/2026-10-02/
...
```

Each date page should contain its screenings directly in HTML.

Small JavaScript enhancements can provide filters, navigation, background refresh, etc.

Do not require client-side React hydration before showing the schedule.

### 5. Progressive enhancement

Baseline:

- HTML
- CSS
- ordinary links

Enhancements:

- date switching
- filtering
- source-status details
- background data update
- optional service worker/offline support

If JavaScript fails, today's schedule should still be useful.

### 6. Transparent freshness

Never make users wonder whether they are looking at stale data.

Expose:

- overall last successful source check
- per-source `checkedAt`
- per-source `changedAt`
- errors/staleness where applicable

Distinguish:

**checkedAt** — when we most recently contacted the source successfully.

**changedAt** — when the normalized data from that source most recently changed.

Example:

```text
Updated 5:42 AM · 8 venues
Refresh sources
```

Expanded status might show:

```text
Trylon     checked 5:41 AM · changed yesterday 2:14 PM
Heights    checked 5:41 AM · changed 5:41 AM
Parkway    checked 3:02 AM · no changes
Emagine    last successful check yesterday 11:18 PM
```

If data may be stale, say so explicitly.

### 7. Manual hard refresh without abusing sources

Users should have a **Refresh sources** action.

This should request a backend ingestion refresh, not merely reload cached frontend data.

Protect upstream sites:

- server-side cooldown per source
- coalesce simultaneous refresh requests
- cache aggressively
- use conditional requests when possible
- never let repeated browser clicks directly generate repeated upstream requests

Example behavior:

```text
Checked Trylon 47 seconds ago. Showing latest data.
```

A manual refresh should surface progress/status but the existing cached schedule should remain visible while refresh occurs.

### 8. Be a good web citizen

Source priority:

1. official documented API or calendar feed
2. ICS/iCal/RSS/other structured feed
3. structured data embedded in HTML, e.g. JSON-LD
4. stable public HTML
5. undocumented endpoint used by the site's own frontend, cautiously
6. headless browser automation only as a last resort

For every source:

- inspect `robots.txt`
- use a descriptive User-Agent with project/contact URL
- use `ETag` / `If-Modified-Since` when available
- fetch infrequently
- implement exponential/backoff behavior after failures
- do not circumvent anti-bot protections
- do not scrape on user page requests
- retain only the data necessary for the index

Prefer factual data:

- title
- venue
- date/time
- format
- programming series
- sold-out status where available
- event URL
- ticket URL

Avoid copying editorial descriptions, imagery, or substantial venue copy.

Ticket purchasing should remain on the venue's own site.

---

## UI direction

Primary mobile view:

```text
TODAY   WED 30   THU 1   FRI 2   WEEKEND

TONIGHT                              SEP 29

5:00
The Long Goodbye
TRYLON · 35mm                             ↗

6:30
Paris, Texas
HEIGHTS · Restoration                     ↗

7:00
Poltergeist
PARKWAY · 35mm · Pre-show DJ              ↗

7:15
The Master
MAIN                                      ↗
```

Chronological ordering is more useful than grouping by theater.

Potential filters:

```text
All · Repertory/Special · 35mm · Special Events
```

Keep filtering secondary. A user should not need to configure anything before seeing movies.

Potential later views:

- Tonight
- Tomorrow
- Weekend
- venue filter
- format filter
- add to calendar
- personal hide/watch preferences stored locally

Do not require accounts for initial versions.

---

## What counts as a screening?

The product should emphasize:

- repertory
- revival
- independent
- restoration
- cult
- festival
- special event
- 35mm / 70mm / unusual formats
- Q&A / filmmaker appearance
- organ accompaniment
- themed programming
- secret screenings
- one-night-only screenings

But avoid making "cool" a mysterious algorithm.

When a venue itself supplies structured signals such as series, format, or event category, preserve those.

A broader `All` view can include first-run programming from participating venues if useful.

---

# Data model

Keep source-specific structures outside the core model.

Suggested normalized shape:

```ts
type Screening = {
  id: string

  title: string
  venueId: string

  startsAt: string       // ISO-8601 with timezone
  endsAt?: string

  eventUrl: string
  ticketUrl?: string

  format?: string        // "35mm", "70mm", "DCP", "4K"
  series?: string
  tags: string[]

  soldOut?: boolean

  sourceId: string
  sourceEventId?: string

  firstSeenAt: string
  lastSeenAt: string
}
```

Source state:

```ts
type SourceStatus = {
  sourceId: string

  checkedAt?: string
  changedAt?: string
  lastSuccessfulAt?: string

  status: "ok" | "stale" | "error"

  lastError?: {
    at: string
    kind: string
    message: string
  }

  sourceFingerprint?: string
}
```

Avoid putting arbitrary source HTML into normalized records.

---

# Adapter architecture

Each source implements a narrow contract.

Conceptually:

```ts
interface SourceAdapter {
  id: string

  fetch(ctx: FetchContext): Promise<SourceResponse>

  parse(
    response: SourceResponse,
    ctx: ParseContext
  ): Promise<ParsedSource>

  normalize(
    parsed: ParsedSource,
    ctx: NormalizeContext
  ): Promise<Screening[]>
}
```

It may be simpler to expose one `ingest()` method externally while retaining fetch/parse/normalize internally for testing.

Suggested layout:

```text
src/
  sources/
    trylon/
      adapter.ts
      parser.ts
      fixtures/
    heights/
      adapter.ts
      parser.ts
      fixtures/
    parkway/
      adapter.ts
      parser.ts
      fixtures/
    riverview/
      adapter.ts
      parser.ts
      fixtures/

  domain/
    screening.ts
    validation.ts
    dedupe.ts

  ingestion/
    ingest-source.ts
    ingest-all.ts
    source-state.ts

  site/
    generate.ts
```

Adapters should be independently replaceable.

Do not create a giant universal scraper full of source-name conditionals.

---

# Testing strategy

This project will live or die based on parser reliability.

The sites are external systems we do not control. HTML changes, CMS upgrades, marketing redesigns, timezone mistakes, ticket-provider changes, and weird event formats are expected behavior.

Treat each adapter as an **untrusted integration boundary**.

## Testing pyramid

The majority of tests should be fast fixture-based parser tests.

Suggested layers:

```text
                   occasional live smoke tests
                         /         \
                 integration tests
                    /           \
             adapter contract tests
               /               \
         parser fixture regression tests
```

Do not make the normal test suite depend on live theater websites.

---

## 1. Raw-source fixtures

Store representative raw source responses in the repository.

Examples:

```text
src/sources/trylon/fixtures/
  normal-week.html
  sold-out.html
  multiple-formats.html
  series-page.html
  malformed-event.html
```

For ICS sources:

```text
src/sources/parkway/fixtures/
  normal-calendar.ics
  recurring-event.ics
  cancelled-event.ics
  timezone-event.ics
```

Fixtures should be **actual captured responses**, sanitized only when necessary.

Include metadata alongside them:

```json
{
  "capturedAt": "2026-09-29T10:41:00Z",
  "sourceUrl": "...",
  "contentType": "text/html",
  "notes": "Normal calendar containing 35mm and DCP screenings"
}
```

This gives future developers context when a parser breaks.

---

## 2. Golden normalized-output tests

For every important fixture, store the expected normalized screenings.

Example:

```text
normal-week.html
normal-week.expected.json
```

Test:

```ts
const raw = fixture("normal-week.html")
const actual = parseAndNormalize(raw)

expect(actual).toEqual(expectedFixture("normal-week.expected.json"))
```

This is intentionally boring.

When changing a parser, the diff should show exactly what normalized data changed.

Golden files are especially valuable here because source formats will evolve repeatedly.

---

## 3. Adapter contract tests

Every adapter must satisfy the same invariants.

Create a reusable contract suite.

Examples:

Every emitted screening must have:

- non-empty title
- known venue
- valid start timestamp
- explicit Twin Cities timezone interpretation
- HTTP(S) event URL
- source ID
- deterministic ID

And:

```ts
startsAt !== Invalid Date
title.trim() === title
tags contain no duplicates
ticketUrl is valid when present
```

Run the same contract suite against every adapter's fixtures.

---

## 4. Edge-case regression fixtures

Whenever production exposes a bug, **capture the offending input before fixing it**.

Then:

1. add fixture
2. add failing test
3. fix parser
4. retain fixture forever

Examples likely to appear:

- midnight screening assigned to wrong date
- `7 PM` vs `7:00PM`
- event containing multiple showtimes
- sold-out showtime
- cancelled screening
- changed ticket URL
- title containing punctuation/entities
- duplicate event appearing on calendar and film page
- DST transition
- venue uses UTC unexpectedly
- `TBA`
- missing ticket link
- rescheduled event
- recurring series with individual dates
- event page contains unrelated dates in footer
- movie title reused for two separate programs
- double feature
- one ticket covers two movies
- midnight movie semantically belonging to Friday night but technically Saturday
- source silently stops returning future events

Tests should encode what **our product** should do, not merely mirror source quirks.

---

## 5. Parser strictness: fail loudly, not silently

A dangerous scraper failure is:

> parser returns `[]`, build succeeds, theater disappears from site.

Avoid this.

Track basic expectations from previous successful ingestions.

Example anomaly checks:

```text
Trylon previously: 42 future screenings
Trylon now:         0 future screenings
→ suspicious
```

Other useful signals:

- expected selector no longer exists
- parsed event count drops dramatically
- percentage of records missing start time increases
- ticket URL domain changes
- duplicate rate jumps
- all future screenings suddenly disappear
- parser begins rejecting most records

These should produce a **source health failure**, not silently publish empty data.

Do not require exact counts because theater schedules legitimately vary.

Use broad anomaly thresholds.

---

## 6. Preserve last-known-good data

A broken parser should not immediately erase a theater.

Ingestion should be transactional:

```text
fetch
↓
parse
↓
normalize
↓
validate
↓
sanity checks
↓
SUCCESS → replace current dataset
FAILURE → retain last-known-good dataset
```

Then expose:

```text
Parkway data may be stale
Last successful update: yesterday 11:18 PM
```

Test this behavior explicitly.

---

## 7. Deduplication tests

The same screening may be discoverable through:

- calendar page
- film detail page
- ticket vendor
- multiple pagination paths

Define deterministic identity rules.

Likely identity ingredients:

```text
venue + normalized title/source ID + startsAt
```

Prefer stable source event IDs when available.

Test:

- exact duplicates
- same movie at two times
- same title at two venues
- same screening with slightly different metadata
- updated screening retaining identity
- rescheduled screening behavior

Do not casually merge screenings based only on title/date.

---

## 8. Timezone tests

This deserves its own suite.

All Twin Cities showtimes ultimately need to resolve to:

```text
America/Chicago
```

Test both CST and CDT periods.

Include DST boundaries.

Never depend on the CI machine's local timezone.

Run tests with a deliberately different process timezone where practical.

Example CI variants:

```text
TZ=UTC
TZ=America/Los_Angeles
```

Normalized results should remain identical.

---

## 9. Property/invariant tests

Some useful parser properties can be checked regardless of fixture:

For normalized future data:

```text
all IDs unique
all dates valid
all venue IDs recognized
all URLs parse
no title is blank
no duplicate tag values
no impossible timezone offsets
```

Potentially use property-based testing later, but simple invariant loops are sufficient initially.

---

## 10. HTML generation tests

The static site itself should have tests.

Given known screening data, assert:

- screenings appear chronologically
- correct date page
- venue displayed
- format displayed
- ticket/event link points to correct URL
- sold-out state rendered
- stale source warning rendered
- freshness timestamp rendered
- page remains useful without JavaScript

Prefer DOM assertions over large HTML snapshots.

Use snapshots sparingly for small stable fragments.

---

## 11. Performance tests

Make performance regressions visible.

At build/test time measure generated assets:

```text
index.html gzip size
CSS gzip size
JS gzip size
```

Warn/fail if budgets are exceeded materially.

Also run Lighthouse or equivalent periodically against a production-like build with mobile throttling.

Important metrics:

- FCP
- LCP
- total transferred bytes
- JS execution
- request count

The more important product-level test:

> Can today's useful screening list render from one cached HTML response?

---

## 12. Manual refresh tests

Test server-side refresh semantics.

Cases:

- refresh after cooldown → fetch occurs
- refresh inside cooldown → cached result returned
- 20 simultaneous refresh requests → one upstream fetch
- one source fails → others still update
- failed source retains last-known-good data
- timestamps distinguish checked vs changed
- successful unchanged fetch updates `checkedAt` but not `changedAt`
- changed normalized data updates both

Use a fake clock.

Do not make these tests sleep in real time.

---

## 13. HTTP behavior tests

Mock source HTTP responses and verify:

- User-Agent
- conditional request headers
- `304 Not Modified`
- timeout behavior
- redirects
- temporary 500
- 429 handling
- retry/backoff policy
- malformed content type
- unexpectedly enormous response
- connection failure

Keep retry behavior conservative.

---

## 14. Optional live smoke tests

Have a separate job that occasionally contacts the real public sources.

This should **not** be required for normal CI or pull requests.

Purpose:

> Does the current source still vaguely resemble what our adapter expects?

Examples:

- request succeeds
- expected root structure exists
- at least one recognizable event exists when appropriate
- parser can produce valid records

Run perhaps daily or a few times per day, not continuously.

A live smoke failure should alert maintainers but should not destroy last-known-good production data.

---

## 15. Source-shape fingerprints

Consider storing lightweight structural observations from successful parses:

```text
parser version
content type
event count
recognized event count
rejected event count
selector/schema version
ticket host(s)
```

This can help answer:

> Did the theater redesign its site, or did it simply publish no movies?

Avoid brittle checksums of entire HTML documents; ads, timestamps, CSRF values, etc. make them noisy.

Fingerprint the pieces the parser actually depends on.

---

## 16. Parser diagnostics

Parsing should produce diagnostics, not only screenings.

Conceptually:

```ts
type ParseResult = {
  screenings: Screening[]

  diagnostics: {
    discovered: number
    accepted: number
    rejected: number

    warnings: ParserWarning[]
  }
}
```

If an event is rejected, preserve a concise reason.

Examples:

```text
missing_start_time
invalid_url
unknown_event_shape
unparseable_date
```

This will make production debugging dramatically easier.

Do not log entire source pages unnecessarily.

---

# Observability

Keep this small but useful.

For each ingestion:

```text
source
startedAt
duration
HTTP status
bytes received
records discovered
records accepted
records rejected
dataset changed?
error?
```

Maintain recent ingestion history.

An internal/admin status page could eventually show:

```text
SOURCE       LAST CHECK   LAST CHANGE   RECORDS   STATUS
Trylon       5:41 AM      yesterday     42        ✓
Heights      5:41 AM      5:41 AM       31        ✓
Parkway      3:02 AM      Monday        18        ✓
Riverview    5:40 AM      yesterday     22        ✓
```

This does not need to become a giant observability stack.

---

# Caching and offline behavior

Static pages should have appropriate CDN caching.

Freshness semantics should be deliberate: users can see when source data was checked regardless of HTTP cache age.

Consider a small service worker after the basic site works.

Desired behavior:

1. show cached schedule immediately
2. check for newer generated data in background
3. update unobtrusively
4. if offline, continue showing last-known data
5. clearly indicate stale/offline state

Do not let service-worker complexity delay V0.

---

# Deployment / implementation bias

Prefer the smallest boring stack that satisfies the requirements.

Reasonable starting point:

- TypeScript/Node for ingestion
- native `fetch`
- lightweight HTML parser where needed
- an ICS parser where needed
- simple static-site generation
- vanilla JS for enhancements
- CDN/static hosting

Do not add:

- React merely for rendering lists
- GraphQL
- a client-side state framework
- a database before persistence/history actually requires one
- Kubernetes
- queues before refresh concurrency requires them
- headless Chromium unless a source genuinely cannot be accessed otherwise

SQLite may eventually be a useful boring choice for source history and normalized screening history, but flat JSON/artifacts may be sufficient for the first implementation.

Make the simplest choice that preserves clean adapter boundaries.

---

# Suggested implementation sequence

## Phase 1 — prove one adapter

Use one straightforward source.

Build:

1. normalized `Screening` schema
2. source adapter interface
3. captured fixture
4. parser
5. golden-output tests
6. contract tests
7. static HTML for one date

Do not start by integrating all theaters.

## Phase 2 — prove heterogeneity

Add a source with a substantially different format, ideally an ICS/calendar source.

If the adapter abstraction survives both cleanly, proceed.

## Phase 3 — useful V0

Integrate approximately four sources:

- Trylon
- Heights
- Parkway
- Riverview

Generate:

- today
- next several dates
- weekend view

Add source freshness information.

## Phase 4 — resilient ingestion

Add:

- last-known-good retention
- anomaly detection
- diagnostics
- refresh cooldown/coalescing
- source status

## Phase 5 — performance/offline polish

Measure before adding complexity.

Potentially add:

- service worker
- stale-while-revalidate behavior
- adjacent-date prefetch
- asset budgets in CI

## Phase 6 — expand sources

Investigate:

- MSP Film / Main
- Lagoon / Landmark
- Emagine curated programs

Do not weaken the architecture to accommodate a particularly hostile source. It is acceptable to omit a venue until there is a sustainable ingestion method.

---

# CI expectations

A pull request should run:

```text
lint
typecheck
unit tests
all fixture parser tests
adapter contract tests
normalization/deduplication tests
timezone tests
static-render tests
asset-size checks
```

No live internet dependency.

A separate scheduled workflow can run live source smoke tests.

---

# Repository documentation

For every adapter, include a short README:

```text
Source: Trylon

Acquisition:
  HTML calendar

Why this method:
  No official structured feed found.

Important assumptions:
  - ...
  - ...

Fixtures:
  - normal-week
  - sold-out
  - multiple-formats

Known limitations:
  - ...

Last manually reviewed:
  2026-09-29
```

The goal is that six months later, a parser failure does not require reverse-engineering why the code was written that way.

---

# Questions to resolve during implementation

These do not need to block the first adapter.

1. What domain/name should the project use?
2. How many future days should be generated by default: 7, 14, or more?
3. Should ordinary first-run movies at Main/Lagoon/Riverview appear in `All`, or should the site be strictly special/repertory programming?
4. Should midnight screenings display under their literal calendar date or under the preceding "night" in the UI?
5. How often should scheduled ingestion run? Start conservatively; perhaps a few times daily.
6. What cooldown should manual refresh use per source?
7. Does V0 need persistence beyond generated JSON plus last-known-good artifacts?
8. Should source status be public from V0 or initially a small expandable details panel?
9. How should double features / one-ticket-multiple-film events be modeled?
10. Are there other Twin Cities venues/programs worth adding after the core four?

---

# Definition of success for V0

On a phone with a poor cellular connection:

1. open the URL
2. immediately see today's interesting screenings
3. scan them chronologically
4. see useful special attributes such as `35mm`
5. tap directly through to the venue/ticket page
6. know exactly when the underlying venue data was last checked
7. explicitly request a fresh source check if desired

Meanwhile, if Trylon redesigns its website tomorrow, the system should:

1. detect suspicious parser behavior
2. fail that ingestion
3. preserve Trylon's last-known-good screenings
4. mark the source stale
5. provide diagnostics sufficient to reproduce the failure
6. allow a developer to capture the new source response as a fixture
7. add a regression test
8. patch only the Trylon adapter

That maintenance loop is a first-class part of the product architecture.
