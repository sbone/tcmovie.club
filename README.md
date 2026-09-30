# tcmovie.club

**Twin Cities Movie Club — find a film tonight. Fast.**

See what's playing at some of the Twin Cities' best local theaters, all in one
place. Browse today's screenings or look ahead over the next two weeks, pick your
favorite theaters, and follow a listing to the theater for tickets.

**[See what's playing → tcmovie.club](https://tcmovie.club)**

Built by a film enthusiast who loves deciding what to see on a random night.
There are wonderful theaters around here. This makes it easier to enjoy them.

## FAST by design

Every page load serves a small, static HTML page with the screenings already in
it. **No spinners. No tracking. No account needed.**

The schedule is readable without JavaScript. A little JavaScript lets you filter
by theater instantly, using the listings already on the page. Your selections
stay in the URL, so you can share a day and a set of theaters with a friend.

The site follows your system's light or dark appearance, with readable colors,
clear selected states, and keyboard-friendly controls. No images or web fonts
need to load before you can find a film.

## Five fine theaters

- [Trylon Cinema](https://www.trylon.org/)
- [Heights Theater](https://www.heightstheater.com/)
- [The Parkway Theater](https://theparkwaytheater.com/)
- [Riverview Theater](https://www.riverviewtheater.com/)
- [The Main Cinema / MSP Film Society](https://mspfilm.org/)

Times are in **Central Time**. Members-only screenings and uncertain start times
are labeled. Check the theater's own listing for the latest details and tickets.

## Keeping it current, keeping it considerate

The goal is **daily updates**. Refreshes are published manually for now, and each
theater's last-checked time is visible on the site. If an update fails, the site
keeps the last good schedule and shows when it may be stale.

Being a good web citizen is part of the project. Schedule collection happens
separately from browsing, with small request limits, saved results, and time
between requests. The collector checks access rules, backs off after failures,
and pauses when a site refuses access. **Your page views never make requests to the theaters.**

The aim is to help people find and support these places while treating their
websites with care. The [collection notes](docs/source-research.md) document
development findings and where coverage still needs work.

## Help make it better

Spot a missing film, a wrong time, or something that's hard to use?
[Open an issue](https://github.com/sbone/tcmovie.club/issues). For a schedule
correction, include the date and a link to the theater's listing.

Ideas, accessibility feedback, official calendar feeds, and small pull requests
are welcome. You don't need to write code to help.

<details>
<summary><strong>For the curious: run it locally and look under the hood</strong></summary>

## Run it locally

With Node.js 24 LTS (24.21.0 pinned in `.tool-versions`), npm, and Python 3
installed, run these commands from a checkout:

```sh
npm ci
npm run check
npm run generate
python3 -m http.server 8000 --bind 0.0.0.0 --directory site
```

Open <http://127.0.0.1:8000> on the server, or `http://<server-IP>:8000` on another
computer using the server's LAN or Tailscale IP. This offline preview uses saved inputs beginning
**September 29, 2026**. Tests and generation make no requests to theater websites.
Generated files stay out of Git.

TypeScript parsers turn theater calendars and pages into validated screenings.
The site generator writes the HTML pages ahead of time. Saved examples support
parser improvements without repeated visits to the source sites.

- [Development guide](docs/development.md): local setup, collection, and publishing.
- [Manual refresh](docs/development.md#manual-refresh-preview-and-deployment):
  check, collect, preview, and choose whether to deploy.
- [Source adapters](src/sources/README.md), [screening types](src/domain.ts),
  [page renderer](src/site.ts), and [tests](test/).

For code changes, add a saved example when relevant and run `npm run check`.

</details>

---

A [Quality Time](https://qualityti.me) Effort.
