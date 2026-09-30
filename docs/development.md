# Development and collection

[Back to the project overview](../README.md). For an offline preview, start with
the [local setup instructions](../README.md#run-it-locally).

## Offline preview options

To preview another date window from the saved inputs:

```sh
npm run generate -- 2027-02-24
```

Optional positional arguments are start date, capture directory, output directory,
and state directory; defaults are `2026-09-29`, `test/fixtures`, `site`, and
`.state/demo`. Generated output and state are ignored by Git. A different date
window does not fetch new data.

## Collector

### Manual refresh, preview, and deployment

Run `npm run refresh` from an interactive terminal with Node.js, Python 3, and
Wrangler access to the `tcmovieclub` Pages project (`npx wrangler login` for initial
authentication). The command runs the tests, refreshes eligible sources, and builds
a separate preview under `.state/previews/`. Its default collector identity is
`https://tcmovie.club`; `TC_CONTACT` can override it.

Use `npm run refresh:publish` to also commit tracked code changes after collection
and before opening the preview. This stages edits/deletions to tracked files and
includes any new files you already staged with `git add`. Untracked files are not
automatically added. Data-only refreshes create no empty commit: generated pages,
HTTP caches, and source state stay outside Git. A commit failure stops the workflow.
The commit is retained even if you decline deployment; this command does not push.
Deployment still requires an explicit `y` or `yes` after the local preview.

The manual workflow includes Trylon whenever at least 24 hours have passed since
its last request; it can run at any time of day. All sources still honor robots,
access pauses, request budgets, conditional requests, and backoff. Re-running
within the wait period rebuilds from saved data without another Trylon request.
The `TC_ENABLE_TRYLON` setting applies only to the separate collector command.

Until a live Trylon snapshot exists, the preview uses the saved capture and
reviewed corrections, keeping their original timestamp and explicit stale labels.
This fallback survives a failed first live attempt but is never written into live
state. Once available, the live feed replaces it completely, without carrying
forward offline corrections. The feed's known coverage gaps remain labeled.
Other theaters use `.state/live`, including its persistent request budgets and
backoff. Running again within the same collection window reuses their data.

After printing each theater's count and freshness, it starts a localhost-only
server on an available port and opens the preview on macOS. Check the dates,
filters, and source notes, then answer `y` or `yes` to deploy those exact files to
`tcmovieclub`'s production branch, `main`. Enter or any other answer declines.
Collection errors remain visible; a source with no saved schedule blocks
deployment. A fatal build/state error stops the workflow. The server stops on
completion or Ctrl-C; collected state and preview files remain for inspection.

This does not schedule updates or run the offline generator after collection.
`npm run generate` still builds the separate historical fixture preview in `site/`.

### Collection without the interactive preview

```sh
TC_CONTACT='https://your-public-project.example' npm run collect
```

Replace the example with your public project URL or contact email. The command
fetches Heights, Riverview, Parkway, and The Main Cinema, retains good data on failure, and writes
14 date pages starting today in Chicago, `screenings.json`, and `sources.json`.
It uses ordinary HTML/calendar/JSON parsers, with no AI calls or fixture corrections.
Optional positional arguments are state and output directories; defaults are
`.state/live` and `site`. Keep live state separate from `.state/demo`.

The standalone collector keeps Trylon disabled by default.
`TC_ENABLE_TRYLON=1` enables its calendar adapter in morning-only mode. It runs only from 7 AM to noon Chicago time and at least 24 hours after
the source's last request. This can skip a morning after a delayed run or spring
DST change. It never imports `reviewed.json` or search-indexed supplements.

The collector uses the existing six-request limit per source per run, twelve per
Chicago date, and ten seconds between same-host requests (or a longer crawl delay).
It checks robots daily, sends conditional headers, bounds responses to 2 MB and
requests to 20 seconds, and follows only approved same-origin schedule redirects.
Robots redirects and new origins require review. `robots-parser` handles the
[robots matching rules](https://github.com/samclarke/robots-parser).
401/403 or disallowed access persistently pause that source. Temporary failures
back off from twelve hours up to seven days, honoring longer `Retry-After` values.
No immediate retries occur. Request counts and backoff survive process restarts.

Heights follows the calendar links needed for the 14-day window. Riverview uses
dated daily listings and the linked Special Screenings page; live collection does
not need yearless film-detail pages. Parkway discovers movie detail links from
the listing. Riverview/Parkway refresh missing or oldest pages first; recent cached
pages may be reused for less than 24 hours when the request budget is exhausted.
The Main makes one request for the current 14-day calendar range (plus its daily
robots check), using `start_date`, exclusive `end_date`, and `_locale=user`.
Only events labeled Theater 1–5 are assigned to The Main. The feed's UTC `start`
field disagrees with its displayed clock times, so the adapter resolves each
`date` and `start_time` in Chicago time. Other venues are excluded.
Only currently discovered pages contribute. Freshness reflects the oldest response
used, and uncovered pages or uncertain times produce diagnostics, not invented data.
The budget does not guarantee complete coverage in one run.

Warnings survive in source state and `sources.json`, alongside checked/changed
timestamps; the CLI prints diagnostics and pages summarize uncertainty. A failed
source retains its last good snapshot while others update. Failures exit nonzero
after writing fallback pages. State corruption stops publication. Raw HTTP caches
remain under `.state/live/http`, outside the published output.

Schedule the built command at 7 AM and 7 PM **America/Chicago** on the deployment
host. For cron implementations supporting `CRON_TZ`, a template is:

```cron
CRON_TZ=America/Chicago
TC_CONTACT=https://your-public-project.example
0 7,19 * * * cd /absolute/path/to/tc-movie-cal && /absolute/path/to/node dist/collect.js
```

Build once with `npm run build`; set real paths/contact before installing this.
The collector allows at most one attempt per morning/evening window and rejects
overlapping runs with `.state/live/collect.lock`. After a process crash, remove
that empty lock directory only after confirming no collector is running. To resume
a reviewed access failure, clear `paused` in the source's HTTP state; preserve its
request counters and retry timestamp. No scheduler or deployment is installed by
this repository. Source terms/access review remains necessary before enabling the job.

## Implementation

[Domain types](../src/domain.ts) use readonly records, tagged unions, and branded
IDs, URLs, and instants. Zod schemas decode unknown data and supply the inferred
TypeScript types. A tagged `Result` makes parser failures explicit; `null` means
unknown metadata without adding a custom Maybe abstraction.

Five pure [source parsers](../src/sources/README.md) feed one HTML renderer from either
the collector or offline captures. Calendar
syntax uses `ical.js`, HTML uses Cheerio, and Chicago local times use Temporal's
IANA timezone rules. Ambiguous or nonexistent local times are rejected. The pages
use ordinary links and inline CSS, with one small inline script for theater
filters and no visible images or web fonts.
Text is escaped and generation enforces a 25 KB compressed HTML budget per page.

[Storage](../src/store.ts) keeps one validated JSON file per source, replacing it
through an adjacent temporary file and atomic rename. Failed imports retain the
last good schedule while other sources can update. Empty results, invalid records,
older captures, and large drops in upcoming screenings are rejected. Generation
still writes the fallback pages and exits with status 1 when an import fails.
Corrupt stored files stop the build instead of silently erasing retained data.

`checkedAt` records the accepted capture timestamp; `changedAt` advances only when
screening content changes. First/last observation times live outside screening
facts and cover records in the current snapshot. Replaying fixtures does not make
them fresh. This is local, single-writer storage, without historical backups or
concurrent ingestion. Cross-source duplicates require an exact normalized title,
venue, and start time after removing explicit format suffixes such as “in 4K.”
The venue's own listing wins, known formats fill missing values, and membership
labels survive.

`npm run check` compiles strict TypeScript and runs domain, fixture, DST, rendering,
storage, collector, and full-generation tests. Collector tests inject HTTP responses
and a clock, covering discovery, budgets, conditional requests, backoff, access pauses,
freshness, source isolation, and the absence of manual Trylon corrections.
Expected fixture examples were manually checked. `skipLibCheck` skips incompatible
declarations shipped by `ical.js`; application code remains strictly checked.

## Theater filters

All screenings are rendered into each date page. Native toggle buttons hide
unselected venues locally, using `?theaters=trylon,heights` for a selection.
Omitting the parameter selects all venues; `?theaters=` selects none. Unknown
IDs are ignored. Date links retain the selection, and browser Back/Forward
restores it. Without JavaScript, the full schedule remains visible.

The self-contained function in [filters.ts](../src/filters.ts) is compiled and
embedded by the renderer, with no extra browser request or runtime dependency.

## Sharing previews

Generated pages include Open Graph and Twitter card metadata directly in HTML.
Each date gets a 1200 × 630 PNG with its date, count of non-cancelled screenings,
and the theaters represented that day. The homepage uses the first date in the
published schedule. Descriptions use “See films on” and Central Time wording.

The [SVG template](../assets/social-card.svg) is rendered at build time with
`@resvg/resvg-js`, using installed system fonts (Helvetica/Arial and Georgia where
available; provide serif/sans-serif fonts on a minimal Linux host). The image URL
includes the date and a content hash so changed cards get new URLs. Previously
shared posts may still retain the platform's cached preview. No card is loaded by
the visible schedule, and no theater requests are made to generate cards.
The build also writes `social-card.png` as a compatibility alias for older shares.

Both the offline generator and manual refresh build cards from their own schedule
inputs; this never advances source freshness timestamps. Deploy the complete
output folder with its `social/` images. Local tests cover metadata, dates, counts,
and PNG dimensions. Check social-app previews after deployment.

## Coverage and remaining work

The reviewed offline window is **September 29–October 12, 2026**, with 270 showings
after removing cross-listed duplicates. Input coverage is now:

| Source | Offline evidence |
| --- | --- |
| Trylon | Saved calendar plus reviewed indexed film-page corrections: September 29 screenings, a sold-out flag, and all three Horrorthon sessions. |
| Heights | Homepage plus September and October calendars, covering the full preview window. |
| Riverview | Daily listings through October 1, an explicitly unscheduled October 2 page, film details, and Special Screenings announcements. |
| Parkway | Movie listing plus all seven event detail schedules in the preview window, including both HUMP showings. |
| The Main Cinema | One 14-day calendar JSON snapshot: 194 Theater 1–5 showings, with five events at other venues excluded. |

The full index also retains published dates outside the preview window. Unknown
times are not invented: Riverview's Canoe Dig It? announcement has no clock time
and remains a parser diagnostic; later Parkway listings retain uncertain event
starts. Calendar placeholder endings are omitted; Horrorthon's explicit program
endings come from its reviewed film page.

All preview pages remain marked stale. Indexed Trylon supplements are reviewed
offline evidence, not a production acquisition method or proof of current coverage.
No Trylon HTTP requests were added. See [source research](source-research.md)
and fixture metadata for capture provenance, bounded request accounting, and
remaining access constraints.

The intended collection schedule is one server job at **7 AM and 7 PM America/Chicago**. It
collects within each source's request budget, retains good data on failure, and
publishes static HTML/JSON with source timestamps. Every visitor request serves
published files; there is no manual refresh or visitor-triggered collection.
Trylon is eligible at the morning run only, with at least 24 hours between requests
as its feed specifies. More restrictive source rules always take precedence.

Before enabling the job, configure the fetcher identity and validate source coverage
and access. The collector is implemented and tested offline; live acquisition and
deployment have not been validated by the automated tests. The fixture preview
remains entirely offline.

The [original project brief](../twin-cities-movie-screenings-codex-handoff.md) remains
the broader roadmap. Raw research responses are retained locally under `.research/`;
committed HTML fixtures remove executable scripts and form tokens.
