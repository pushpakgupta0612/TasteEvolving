# TasteEvolving — Find the unexpected

TasteEvolving helps people discover connections between books, films, music, series, and art. The experience is built around Taste Bridge, Connection Chain, Explore, and Discovery Trails.

## What is included

- **Taste Bridge:** choose Books or Movies and one starting title. The app chooses a destination and builds a multi-step journey. Each hop requires at least two shared thematic tags, or one shared tag reinforced by a compatible emotional family, or an explicit creator/cast relationship in the curated catalogue. Routes are scored for repeated themes, mood continuity, genre/cast overlap, and a beginning–turning-point–resolution shape.
- **Hollywood and Bollywood movie collections:** the catalogue includes 107 curated Hollywood and Bollywood titles, with selected releases from 2010–2025, with director, selected cast, genre, mood, story beat, and thematic tags where curated. This is not an exhaustive list of every famous film or actor.
- **Connection Chain:** play multiple-choice or free-build mode. Choose how to connect: shared themes, same mood, actor/cast, director, genre, or a combined set of links. The quiz asks players to choose a valid next step that shortens a supported route to the target.
- **Explainable links:** the app distinguishes interpretive thematic links from catalogue credit matches. The nine existing source-backed factual relationships retain source links. Expanded cast/director metadata is curated and explicitly not represented as a complete or independently verified filmography.
- **Explore:** search titles, creators, tags, selected cast and genres; filter by media type, mood, and theme.
- **My Collection:** save works and bridges on this device.
- **Discovery Trails:** assemble and save a sequence of works. Completed Connection Chains can be saved as trails.

## Connection quality and limitations

A single common tag is not enough for a thematic Taste Bridge hop: the route requires at least two shared themes, or one shared theme reinforced by a compatible emotional family, unless the pair has a curated cast/director relationship. Shared genre can be used as a game rule and is shown separately from thematic evidence. Mood is an editorial descriptor, not a scientific measure. The story-style description frames a route as a beginning, turning point, and resolution; it is a narrative interpretation generated from the catalogue, not a claim that the works share a plot or direct influence.

The expanded Hollywood/Bollywood list is curated rather than exhaustive. Cast and genre coverage varies by title; missing metadata must not be interpreted as proof that two works have no relationship. The current regional filters contain 55 Hollywood and 52 Bollywood titles, and the overall catalogue also retains international and pre-2010 works outside those two filters. The app does not invent external source links for these newly curated credits. Existing source-backed links are stored in `src/lib/data/factual-connections.json`.

## Tech stack

- Svelte 5 + TypeScript
- Vite
- JSON-based catalogue and curated credit metadata
- Browser `localStorage` for saved works, bridges, trails, artwork cache, and game progress

## Run locally

Requires Node.js 20.19+ or 22.12+ for Vite 8.

```bash
npm install
npm run validate:data
npm run build
npm run dev
```

## Deploy to Vercel

1. Push the project to GitHub.
2. Import the repository in Vercel.
3. Use the Vite framework preset, build command `npm run build`, and output directory `dist`.
4. No environment variables are required for core functionality.

Saved data stays in the current browser and is not synced to an account. Artwork is requested from public services at runtime; missing covers should not prevent the app from working.


### Actor-led Connection Chain

When **Shared actor** is selected in Connection Chain, the game now works like a cast explorer: it shows the actor names recorded for the current film, lets the player select a name, then lists other catalogue films featuring that actor. Choosing one of those films advances the chain and reveals the cast evidence for the hop. The explorer respects the selected Hollywood/Bollywood filter and clearly notes that cast metadata is curated and may not be exhaustive.

### Narrative Taste Bridge

Taste Bridge now presents each generated route as a short narrative first: a descriptive title, a medium-length connection story, a Beginning / Turning Point / Resolution arc, a concise evidence explanation, and a final discovery insight. It uses curated story beats, recurring tags and emotional arcs, genres, cast overlaps, and director metadata where available. The text is interpretive and explicitly does not claim direct influence between works.


### Connection Chain and collection filters

The non-working Hollywood/Bollywood selector has been removed from both Taste Bridge and Connection Chain. Taste Bridge now uses the complete Books or Movies collection. Connection Chain uses all works, and actor/director/genre rounds are restricted to films internally where the relationship requires film credits.

For **Shared actor**, choose a cast name shown under the current movie to see other catalogue films featuring that actor. Actor challenges start with a pair of films that share a listed cast member. Two hints are available per round; after the second hint, the control becomes **Restart challenge**. **Same director** remains a separate connection rule and uses the catalogue's director field.

## Live discovery APIs

The Explore page now includes a Live Discovery panel that searches beyond the curated catalogue:

- **Open Library Search API** for books (no private key required).
- **Apple iTunes Search API** for music (no private key required).
- **The Movie Database (TMDB) API** for film and TV search (requires a private key configured on the server).

### Configure TMDB on Vercel

1. Create an account at https://www.themoviedb.org/ and request API access.
2. In your Vercel project, open **Settings → Environment Variables**.
3. Add `TMDB_READ_ACCESS_TOKEN` (recommended, TMDB API Read Access Token) or `TMDB_API_KEY` (v3 API key). Keep it server-side; do not add it to a `VITE_` variable or commit it to Git.
4. Redeploy the project.
5. Open Explore → Live Discovery → Film & TV and search for a title.

The Vercel serverless endpoint is `api/discover.js`. It normalises the API results and keeps the TMDB credential out of the browser bundle. Book and music searches can use their public APIs without a key; if `/api/discover` is unavailable during local Vite development, the interface falls back to direct Open Library/iTunes requests for those two categories. Film/TV search requires the deployed server endpoint and TMDB credential.

Live results are clearly labelled as external discoveries and are not silently inserted into the curated catalogue or used as verified Taste Bridge evidence. A result with a matching title in the curated catalogue can open that work inside TasteEvolving; otherwise, its source link opens in a new tab.

TMDB attribution: “This product uses the TMDB API but is not endorsed or certified by TMDB.” Film/TV results are for discovery and informational purposes.

## Visual direction

The UI uses an editorial culture-journal direction: warm paper surfaces, ink typography, a restrained signal-coral accent, large serif display headings, deliberate spacing, and responsive cards. The intention is to make the app feel like a designed creative product rather than a generic AI dashboard.

## Growing the catalogue from live sources

The Explore page includes live search for TMDB (films/TV; requires a server-side `TMDB_READ_ACCESS_TOKEN` or `TMDB_API_KEY`), Open Library (books), and Apple iTunes Search (music). Choose **Add to my library** on a result to save it in this browser's personal library. Imported works appear in the same Explore collection and can be used in the existing bridge/game flows, but remain separate from the checked-in `src/lib/data/works.json` catalogue.

Use **Export imported works** to download `tasteevolving-imported-works.json`. Review the title, creator, year, description, artwork, and suggested tags before merging any entries into `src/lib/data/works.json`. Suggested tags are heuristic hints, not verified metadata or evidence of direct influence. Do not create factual connections without reliable sources. Run `npm run validate:data` after editing the static catalogue.

Open Library asks applications to cache responses, identify their app, and avoid bulk harvesting; this workflow uses human-initiated searches rather than bulk downloading. See https://openlibrary.org/developers/api and https://developer.themoviedb.org/docs for source policies and API setup.
