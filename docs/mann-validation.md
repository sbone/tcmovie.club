# Mann branch validation — October 12, 2026

Validated `feat/mann-grandview-highland`, based on `eb20e5d`, with the
working-tree fixes recorded alongside this report.

`npm run check` passed all 60 tests with no failures or skips. This includes
strict compilation, parser/fixture, collector, HTTP boundary, storage, filters,
rendering, generation, and automation regressions. `npm run typecheck` and
`git diff --check` also passed.

The first run could not compile. Fixes complete Mann fixture loading and offline
generation metadata and remove unreachable HTTP switch cases. Subsequent checks
found missing Mann setup in the automation test and shared-host request spacing
between Grandview and Highland. Collection now serializes sources sharing an
origin and shares their request timestamps; other origins remain concurrent.
The collector regression checks six requests per source and ten seconds between
requests to the same host.

Live HTTP acquisition used the existing robots-aware, bounded HTTP client with
`https://tcmovie.club` as contact. It fetched five Grandview date pages and three
Highland date pages. The initial live parse exposed rejection of the site's
“Today” and “Tomorrow” labels. The corrected parser checks the selected date
picker button against the expected month/day for those labels. Reduced real
Highland captures for October 12–14 and their response metadata are saved under
`test/fixtures/mann/`; a regression checks valid dates, wrong dates, wrong
theaters, and missing date selection.

After correction, the live responses were replayed without additional network
requests through `collectSource`, source acceptance/storage, and page generation.
All eight captured pages parsed without invalid records: 14 Grandview screenings
and 12 Highland screenings were accepted, and 14 preview pages were generated.
The replay verified the homepage contains both theaters and a captured Highland
title. Full responses, accepted state, generated preview, and the replay summary
remain in ignored `.state/mann-verification/`; the final suite log is
`/private/tmp/tc-regression-final.log`.

Future coverage remains incomplete and is reported as a diagnostic. This check
does not establish a complete 14-day schedule or validate deployment. The compact
mobile filter redesign remains a separate task. No PR status, deployment, or
production state was changed.
