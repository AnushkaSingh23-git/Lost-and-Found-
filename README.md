# BLUE – Lost and Found, Reinvented

A campus lost & found web app that matches lost reports against found reports and scores each match from 0–100%.

## Run it

Requires **Node.js 22.5+**. It uses only Node's built-in modules (`http` and `node:sqlite`), so there's nothing to `npm install`.

```bash
npm start          # http://localhost:3000 (seeds 150 sample records on first run)
npm test           # end-to-end API test, incl. "Lost: Grey hoodie, Library, yesterday at 4 PM"
npm run seed       # wipe the database and re-seed the 150 sample records
```

Data is stored in `lostfound.db` (SQLite), next to the code.

## Features

- **Dashboard**: totals, the top 3 most-lost items, the top 3 hotspots, a clickable campus hotspot map and the latest reports.
- **One-line reporting**: type something like *"Lost: Grey hoodie, Library, yesterday at 4 PM"* and the form fills itself in. Chips for item, colour, location and time keep a report under 30 seconds.
- **Matching results**: a score ring with the percentage, a per-factor breakdown and plain-English reasons.
- **Match alert**: a pop-up, banner and toast appear when a new report matches an existing one at 60% or more.
- **Reunited**: one tap closes both reports, with a confirmation and a confetti animation.
- **Browse and search** all open, lost, found and reunited reports.
- Blue and white design, responsive, with a bottom tab bar on phones.

## Matching (matcher.js)

| Factor      | Weight | How it is scored |
|-------------|-------:|------------------|
| Item        | 30 | Synonym categories, e.g. bottle = flask = tumbler and hoodie = sweatshirt = jumper |
| Colour      | 20 | Colour families, e.g. navy ≈ blue and charcoal ≈ grey; close shades get partial credit |
| Location    | 20 | Same place = full credit; neighbouring buildings = partial credit |
| Time        | 10 | Closer in time scores higher; a "found" time well before the "lost" time is penalised |
| Brand       | 10 | Must match exactly; neutral if either report has no brand |
| Description | 10 | Overlap of the distinctive words |

A different kind of item is capped at 25%, and clearly different colours reduce the score.
For example, "Navy bottle" vs "Blue water bottle" in the same place and time scores **88%**.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/lost` | Add a lost report. Returns `{ item, matches[], alert }` |
| POST | `/api/found` | Add a found report. Returns `{ item, matches[], alert }` |
| GET | `/api/items/:id/matches` | Scored matches for a report |
| POST | `/api/items/:id/reunite` | Mark as reunited. Body `{ matchId }` (optional) closes both reports |
| GET | `/api/items?type=&status=&q=` | List and search reports |
| GET | `/api/items/:id` | One report and the report it was reunited with |
| GET | `/api/stats` | Totals, top items, top locations and hotspot map data |
| POST | `/api/parse` | `{ text }` → form fields parsed from one line |
| GET | `/api/meta` | Categories, colours, locations and storage points |

Report body: `{ name, colour?, brand?, location, time?, description?, stored_at? }`. `location` must be one of the campus locations listed by `/api/meta`.

## Files

```
server.js   HTTP server: REST API + static files
db.js       SQLite schema and queries
matcher.js  matching and scoring engine
parser.js   one-line report parser
seed.js     150 fake, anonymous records
data.js     categories and synonyms, colour families, campus locations and map layout
test.js     end-to-end test
public/     frontend (index.html, styles.css, app.js)
```

No real names or phone numbers are stored. Found items record only where they are being held, e.g. "Security Desk".
# Lost-and-Found-
