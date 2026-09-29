# Offline source adapters

Each parser accepts saved text, returns a tagged result with screenings and
diagnostics, and makes no network requests. Shared validation rejects invalid
records and conflicting IDs. Intentional exclusions have separate diagnostics.
The generator rejects an import with any invalid records and retains its last
good snapshot. Fixtures, capture metadata, and representative expected records
live under `test/fixtures/<source>/`.

| Source | Input and interpretation | Known limits |
| --- | --- | --- |
| Trylon | iCalendar UID, local DTSTART in America/Chicago, location and categories. Includes screenings hosted at Heights. | Ignores malformed feed timezone transitions in favor of IANA rules. Rejects recurrence rules. Omits apparent placeholder end times and excludes a ticket-sale event. Captured calendar coverage is unverified. |
| Heights | Homepage film cards and explicit datetime attributes. Ticket IDs identify showings; users follow film links. | Excludes series passes. Only captured homepage coverage; ticket purchase actions are never requested. |
| Riverview | Dated Now Playing list plus saved film detail pages. Resolves yearless detail dates against dated navigation and weekday, allowing the preceding week for lingering past shows. | Two film detail examples, including a reduced Akira fixture derived from indexed source text. Unresolvable dates are rejected; future coverage is incomplete. |
| Parkway | Movies summary cards plus saved detail pages. Uses event starts unless detail text explicitly identifies movie and doors times. | Excludes the movie pass. Only one detail page is captured; most film times remain unconfirmed. |

Trylon recognizes club membership events; Heights and Parkway recognize members-only
titles. Riverview access remains unknown. Unrecognized access and availability stay
unknown; no adapter infers runtime or public access.
The capture loader loads all paired detail HTML/metadata files in each source directory.
It uses recorded homepage HTTP response dates conservatively for freshness,
including potentially cached responses, rather than the time the demo is generated.

See [source research](../../docs/source-research.md) before implementing acquisition.
