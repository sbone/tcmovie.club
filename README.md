# tcmovie.club

**Twin Cities Movie Club** — quickly see what movies are playing at the most exquisite Twin Cities theaters.

[Visit tcmovie.club](https://tcmovie.club)

## The theaters

The project follows:

- [Trylon Cinema](https://www.trylon.org/)
- [Heights Theater](https://www.heightstheater.com/)
- [The Parkway Theater](https://theparkwaytheater.com/)
- [Riverview Theater](https://www.riverviewtheater.com/)
- [The Main Cinema / MSP Film Society](https://mspfilm.org/)

Schedules are organized by day, with times in **America/Chicago**. Members-only
screenings stay visible and labeled. If a source gives an event start without a
confirmed film time, the listing says so. Source timestamps help you judge how
recent the information is; the theater's own page is the final place to check.

Use the theater buttons to show any combination of venues. Your selection stays
in the URL and follows you between dates, so you can share a filtered schedule.

## Fast pages, a light touch

The site serves small, static HTML pages. A small inline script filters the
listings already on the page; the full schedule is readable without JavaScript.
The schedule loads no images or web fonts. Opening a page or changing a filter
never triggers a request to a theater's website.

Collection happens separately, with small request budgets, pauses after failures,
and checks of each source's access rules. The intended update schedule is 7 AM
and 7 PM Chicago time, subject to each source's limits. The aim is to help people
find and support these theaters while being considerate of their websites.

## Where things stand

This is an early project. The reproducible preview in this repository uses saved
source data from **September 29, 2026**, covering September 29–October 12. It is a
historical snapshot, not a promise of current ticket availability.

The parsers, collector, and page generator are implemented and tested. Recurring
collection and publishing are not configured by this repository. Trylon's live
collection remains paused while access and feed completeness are resolved.
Landmark Lagoon and Emagine Willow Creek are possible additions, pending an
approved way to use their schedules.

The [source research](docs/source-research.md) records what was inspected, what
worked, and what remains uncertain. Saved examples and tests make that work
reproducible without repeatedly visiting the theaters' sites.

## Help make it better

Moviegoers and developers are welcome to contribute. Useful contributions include:

- **Corrections:** a wrong time, missing screening, or misleading label. Include
  the date and a link to the theater's listing so we can check it.
- **Usability:** clearer wording, better keyboard access, or a smoother experience
  on a small screen.
- **Sources:** an official calendar feed, an approved data source, or a theater
  we should consider. Please review access rules before collecting new data.
- **Code:** small fixes and parser improvements, with a saved example that
  demonstrates the problem.

[Open an issue](https://github.com/sbone/tcmovie.club/issues) to report something
or discuss an idea. Small pull requests are welcome too. You don't need to write
code to help.

## Run it locally

With Node.js 22, npm, and Python 3 installed, run these commands from a checkout:

```sh
npm ci
npm run check
npm run generate
python3 -m http.server 8000 --bind 127.0.0.1 --directory site
```

Open <http://127.0.0.1:8000>. Tests and page generation use saved inputs and make
**no requests to theater websites**. Generated files go into `site/` and stay out
of Git. The default preview begins September 29, 2026.

## How it works

TypeScript parsers turn each theater's calendar or page into validated screening
records. The generator combines those records and writes ordinary HTML date
pages. If an update fails, the last good schedule is kept and its age remains
visible. Unknown times and ticket availability stay unknown.

For a look under the hood, start with the [source adapters](src/sources/README.md),
[screening types](src/domain.ts), [page renderer](src/site.ts), or [tests](test/).
For a code change, add a saved example when relevant and run `npm run check`.
The [development guide](docs/development.md) has the storage, validation, and
coverage details; the [original project brief](twin-cities-movie-screenings-codex-handoff.md)
contains the broader ideas behind the project.

## Collector

For a hands-on update, `npm run refresh` checks the app, refreshes eligible sources,
opens a local preview, and asks before deploying to Cloudflare. Trylon uses its
clearly labeled saved data for now. See the [manual refresh guide](docs/development.md#manual-refresh-preview-and-deployment).

Live collection is a separate command from the offline preview. The
[collector setup guide](docs/development.md#collector) covers the project identity,
request limits, source restrictions, and scheduling. It is intended to run once
on the collection host, with visitors receiving the resulting static pages.
