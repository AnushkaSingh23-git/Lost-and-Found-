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

### Vector matching API

Run LM Studio (or any OpenAI-compatible embeddings server) with Nomic Embed Text v1.5 (`text-embedding-nomic-embed-text-v1.5@q8_0`).

The app defaults to `http://172.16.0.2:1234/v1/embeddings` and model `text-embedding-nomic-embed-text-v1.5@q8_0`. Set `LF_EMBEDDINGS_URL` to override the server URL or full endpoint, `LF_EMBEDDINGS_MODEL` to override the model ID, `LF_EMBEDDINGS_TIMEOUT_MS` to adjust request timeout (default `30000`), and `LF_EMBEDDINGS_API_KEY` if the server requires bearer authentication. Item text is sent to the configured endpoint and document embeddings are cached in SQLite (`item_embeddings`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/vector/status` | Check embedding server availability, active model, and indexed item count |
| GET | `/api/vector/search?q=&type=&status=` | Semantic + lexical search across reports |
| POST | `/api/vector/lost` | Save a lost report and return `{ item, matches, alert }` |
| POST | `/api/vector/found` | Save a found report and return `{ item, matches, alert }` |
| GET | `/api/vector/items/:id/matches` | Return `{ item, matches }` for any saved report |

These routes use the same report body and SQLite database as the main API. Use `POST /api/items/:id/reunite` to close a pair. The web UI integrates Vector AI matching (with a toggle to Classic rules) and semantic search in Browse when the embedding server is available.

The vector routes rank up to six open reports of the opposite type. Cosine similarity across item names, colours, brands, and descriptions contributes 65% of the score. Category, location, and time contribute the rest. Reports with different known categories are excluded. Reports with unrecognized categories can still match through their text. Each match includes a `breakdown` with `semantic`, `category`, `location`, and `time` scores. Report creation returns an alert when the top match scores at least 68. If embedding requests fail, the API returns HTTP 503 before saving a report.

Run `npm run test:vector` (or `npm test -- --vector`) with the embedding server running to verify all vector routes, semantic search, and SQLite embedding caching using an in-memory database.

Run `npm run test:accuracy` with the embedding server running to compare fuzzy and vector match rankings on seeded pairs and paraphrases, and count false alerts for reports with no counterpart. The benchmark uses an in-memory database.

#### Accuracy benchmark results

This run started with 150 seeded reports and used `text-embedding-nomic-embed-text-v1.5`. Each Top *k* column counts cases where the known match appeared among the first *k* results.

| Case | Matcher | Top 1 | Top 3 | Top 6 |
|---|---|---:|---:|---:|
| Seeded pairs | Fuzzy | 28/28 | 28/28 | 28/28 |
| Seeded pairs | Vector | 25/28 | 28/28 | 28/28 |
| Paraphrases with descriptions | Fuzzy | 4/18 | 4/18 | 4/18 |
| Paraphrases with descriptions | Vector | 18/18 | 18/18 | 18/18 |
| Paraphrases without lost descriptions | Fuzzy | 3/18 | 4/18 | 4/18 |
| Paraphrases without lost descriptions | Vector | 16/18 | 17/18 | 17/18 |

| Matcher | Reports with a suggestion despite no known counterpart | False alerts |
|---|---:|---:|
| Fuzzy | 5/12 | 2/12 |
| Vector | 12/12 | 2/12 |

## Files

```
server.js   HTTP server: REST API + static files
db.js       SQLite schema and queries
matcher.js  matching and scoring engine
vector-matcher.js  embedding client and vector ranking
parser.js   one-line report parser
seed.js     150 fake, anonymous records
data.js     categories and synonyms, colour families, campus locations and map layout
test.js     end-to-end test
benchmark.js  fuzzy and vector accuracy comparison
public/     frontend (index.html, styles.css, app.js)
```

No real names or phone numbers are stored. Found items record only where they are being held, e.g. "Security Desk".
# Lost-and-Found-
