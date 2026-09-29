# Twin Cities Movie Screenings

A small TypeScript foundation for the [project brief](twin-cities-movie-screenings-codex-handoff.md).

```sh
npm ci
npm run check
```

The local `.tool-versions` selects the Node version already installed on this machine.
`build` currently compiles the domain module; it does not generate a website.
Tests are offline. There is no fetch command, scheduler, deployment, or running service yet.

## Types

[src/domain.ts](src/domain.ts) uses Elm-style modeling with ordinary TypeScript:

- Readonly records and lists; Zod decodes `unknown` into validated domain values.
- A tagged `Result` makes validation failure explicit.
- A screening is scheduled with known/unknown availability, or cancelled.
- Access is explicitly unknown, public, or members-only. Screening facts do not
  require ingestion bookkeeping timestamps.
- A start is a confirmed screening time, optionally with doors time, or an event
  time whose film start is unconfirmed. Render the latter with `startLabel`.
- Source state is not checked, ready with a snapshot, or failed with optional
  last-known-good data. `sourceScreenings` reads that data; durable storage and
  ingestion transitions are still to be implemented.
- Validated IDs, URLs, and timestamps have distinct branded types. Schemas are
  the source of truth; inferred types avoid parallel handwritten definitions.
- `null` represents absent metadata. We do not invent defaults for unknown times,
  formats, or ticket availability, or wrap every nullable field in a custom Maybe.
- Exhaustive switches use `never`, so adding a union variant requires updating
  its consumers. TypeScript assertions can bypass checking; avoid `as Screening`.

Timestamps require an explicit offset and normalize to UTC. Adapters must resolve
local showtimes using `America/Chicago`; a valid offset alone does not prove a
source's local time was interpreted correctly. Domain tests cover offset handling,
not yet local-time parsing or all DST edge cases.

## Source research and next work

See [the source report](docs/source-research.md). Heights is a straightforward HTML
adapter candidate. Trylon now also has a successful user-supplied calendar capture
for offline adapter development, despite the earlier automated requests returning
403. Its feed requests a minimum 24-hour refresh interval. Recurring ingestion
remains disabled; the report records timing and event-classification caveats.

Include all films from participating venues and retain explicit special-programming
signals. Exclude standalone concert listings and passes that are not screenings.
Keep members-only screenings visible with an explicit “Members only” label.
The domain represents this; the renderer will display the label.

Next milestone: one offline command turns the saved Trylon calendar into a useful
chronological HTML date page. Keep the implementation small:

1. Preserve a captured fixture with provenance and manually checked expected data.
2. Write one pure Trylon parser and focused regression tests. Use existing parsers
   for calendar syntax and reliable timezone handling; do not build a calendar engine.
3. Represent membership access explicitly, including unknown access. Keep ingestion
   bookkeeping out of parser input/output; add it when storing ingestion results.
4. Render the parsed screenings as ordinary HTML with escaped text, useful links,
   membership/uncertain-time labels, and the capture's actual freshness timestamp.
5. Add Heights, then Riverview and Parkway. Extract shared helpers only when actual
   implementations need them. Do not introduce an adapter framework in advance.

The existing six tests cover domain behavior, not source parsing, local-time
conversion, durable retention, or HTML output. Add those checks with the corresponding
working behavior; the original handoff's test catalog is not a scaffolding checklist.

Add durable last-known-good storage before enabling ingestion. Scheduled fetching,
manual refresh, cooldowns, and backoff come after the offline path works. The fetcher
identity is deliberately unset for now; it does not block parser/rendering work.
No additional live requests are needed for this milestone.

Downloaded research bodies are retained under `.research/2026-09-29/`, ignored by
Git, with a request manifest. They can contain public form tokens and venue copy;
sanitize the relevant captured responses before adding parser fixtures to Git.
The tests currently use explicitly synthetic domain inputs, not real showtimes.
