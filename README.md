# tcmovie.club

A small TypeScript app that turns saved Trylon, Heights, Riverview, and Parkway
listings into chronological HTML date pages. Includes all films, explicit
“Members only” labels, and “Event starts · film time unconfirmed” where needed.

```sh
npm ci
npm run check
npm run generate
python3 -m http.server 8000 --bind 127.0.0.1 --directory site
```

Open <http://127.0.0.1:8000>. The local `.tool-versions` selects Node 22.
Generation and tests are entirely offline: no theater requests, scheduler,
fetch command, or deployment. The default preview starts September 29, 2026,
using captures saved that day. It produces 14 date pages and `screenings.json`.
To preview another window (including a members-only screening):

```sh
npm run generate -- 2027-02-24
```

Optional positional arguments are start date, capture directory, output directory,
and state directory; defaults are `2026-09-29`, `test/fixtures`, `site`, and
`.state/demo`. Generated output and state are ignored by Git.

## Implementation

[Domain types](src/domain.ts) use readonly records, tagged unions, and branded
IDs, URLs, and instants. Zod schemas decode unknown data and supply the inferred
TypeScript types. A tagged `Result` makes parser failures explicit; `null` means
unknown metadata without adding a custom Maybe abstraction.

Four pure [source parsers](src/sources/README.md) feed one HTML renderer. Calendar
syntax uses `ical.js`, HTML uses Cheerio, and Chicago local times use Temporal's
IANA timezone rules. Ambiguous or nonexistent local times are rejected. The pages
use ordinary links and inline CSS, with no client JavaScript, images, or web fonts.
Text is escaped and generation enforces a 25 KB compressed HTML budget per page.

[Storage](src/store.ts) keeps one validated JSON file per source, replacing it
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
storage, and full-generation tests, including a failed-source recovery scenario.
Expected fixture examples were manually checked. `skipLibCheck` skips incompatible
declarations shipped by `ical.js`; application code remains strictly checked.

## Coverage and remaining work

The reviewed offline window is **September 29–October 12, 2026**, with 76 showings
after removing cross-listed duplicates. Input coverage is now:

| Source | Offline evidence |
| --- | --- |
| Trylon | Saved calendar plus reviewed indexed film-page corrections: September 29 screenings, a sold-out flag, and all three Horrorthon sessions. |
| Heights | Homepage plus September and October calendars, covering the full preview window. |
| Riverview | Daily listings through October 1, an explicitly unscheduled October 2 page, film details, and Special Screenings announcements. |
| Parkway | Movie listing plus all seven event detail schedules in the preview window, including both HUMP showings. |

The full index also retains published dates outside the preview window. Unknown
times are not invented: Riverview's Canoe Dig It? announcement has no clock time
and remains a parser diagnostic; later Parkway listings retain uncertain event
starts. Calendar placeholder endings are omitted; Horrorthon's explicit program
endings come from its reviewed film page.

All preview pages remain marked stale. Indexed Trylon supplements are reviewed
offline evidence, not a production acquisition method or proof of current coverage.
No Trylon HTTP requests were added. See [source research](docs/source-research.md)
and fixture metadata for capture provenance, bounded request accounting, and
remaining access constraints.

The collection plan is one server job at **7 AM and 7 PM America/Chicago**. It
collects within each source's request budget, retains good data on failure, and
publishes static HTML/JSON with source timestamps. Every visitor request serves
published files; there is no manual refresh or visitor-triggered collection.
Trylon is eligible at the morning run only, with at least 24 hours between requests
as its feed specifies. More restrictive source rules always take precedence.

Before enabling the job, settle the fetcher identity and validate source coverage
and permitted access. Keep acquisition small: conditional requests, bounded
timeouts, and backoff until a later scheduled run. Collection and deployment
remain unimplemented; the current preview is entirely offline.

The [original project brief](twin-cities-movie-screenings-codex-handoff.md) remains
the broader roadmap. Raw research responses are retained locally under `.research/`;
committed HTML fixtures remove executable scripts and form tokens.
