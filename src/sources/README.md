# Source adapters

Each parser accepts saved text, returns a tagged result with screenings and
diagnostics, and makes no network requests. Shared validation rejects invalid
records and conflicting IDs. Intentional exclusions have separate diagnostics.
The generator rejects an import with any invalid records and retains its last
good snapshot. Fixtures, capture metadata, and representative expected records
live under `test/fixtures/<source>/`.

| Source | Input and interpretation | Known limits |
| --- | --- | --- |
| Trylon | iCalendar UID, Chicago DTSTART, location and categories. Includes Heights screenings. The capture loader applies validated reviewed records by ID, preserving matched feed UIDs. | Indexed supplements restore September 29, sold-out status and the missing Friday Horrorthon session. They are offline evidence only. Ignores malformed feed timezone transitions, rejects recurrence rules, and omits calendar placeholder endings. |
| Heights | Homepage plus monthly calendars. Dates come from the calendar month/year and day cell; ticket IDs identify showings. | Excludes passes. Calendar omissions of DCP are filled from explicit homepage values; conflicting facts reject the import. Ticket actions are never requested. |
| Riverview | Dated listings, saved film details, and Special Screenings announcements. Detail years resolve against navigation plus the prior week. Specials resolve against the homepage date and weekday within the prior week / next 180 days. | Daily listings cover September 29–October 1. October 2 explicitly has no scheduled shows. Missing start times produce diagnostics; special events outside the daily schedule remain included. Akira is a reduced source-derived fixture. |
| Parkway | Movies summary cards plus detail schedules. Explicit Movie, Film, Screening or Show starts confirm a film/program start. Multiple starts produce separate records with paired doors times. | All seven events in the preview have details. Later dates still retain uncertain event starts. Ambiguous time pairings reject the import. Multi-event passes are excluded. |

Trylon recognizes club membership events; Heights and Parkway recognize members-only
titles. Riverview access remains unknown. Unrecognized access and availability stay
unknown; no adapter infers runtime or public access.
The capture loader loads paired HTML/metadata for calendars, dated lists, specials,
and details. Duplicate identities must agree after filling an omitted format.
New Parkway detail fixtures retain only original date and schedule DOM elements;
their full raw responses remain in local research. Parser output was checked to
remain identical after reducing those fixtures.
It uses recorded homepage HTTP response dates conservatively for freshness,
including potentially cached responses, rather than the time the demo is generated.

See [source research](../../docs/source-research.md) for acquisition constraints.

`collect.ts` now discovers live inputs with the bounded HTTP client in `../http.ts`.
It feeds these same pure parsers without loading fixtures or reviewed overrides.
Heights follows monthly calendars, Riverview follows dated pages and specials,
and Parkway follows movie detail links. Missing pages and uncertain starts remain
diagnostics in stored state and published `sources.json`. See the root README for
configuration, request limits, and scheduling. The table above describes the
historical offline fixtures; it is not a live coverage guarantee.
