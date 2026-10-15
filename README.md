# TasteEvolving

TasteEvolving is a Svelte 5 + Vite discovery app for exploring connections between films, books, art, music, and ideas.

## Requirements

- Node.js 20.19+ or 22.12+ (required by the Vite 8 toolchain)
- npm

## Run locally

```bash
npm install
npm run validate:data
npm run check
npm run build
npm run dev
```

Open the local URL printed by Vite. `npm run check` currently runs the dataset validator; it is not a Svelte type-checker.

## Main features

- **Taste Bridge:** builds an evidence-based route between a starting book or film and a destination, then explains the thematic and emotional through-line.
- **Connection Chain:** quiz and build modes for shared themes, mood, genres, actors, directors, and sourced credits.
- **Explore works:** search, filter, sort, and inspect catalogue entries.
- **My collection and Discovery Trails:** save works, bridges, and chains in this browser using local storage.

## Data and limitations

The catalogue is stored in `src/lib/data/works.json`; sourced factual relationships are in `src/lib/data/factual-connections.json`. Some actor, director, and genre connections rely on curated catalogue metadata and may be incomplete. The interface should be treated as a discovery aid, not an exhaustive filmography or a source of verified claims beyond the cited relationships.

Artwork is fetched from Open Library or Wikipedia/Wikimedia APIs at runtime when available. Missing artwork falls back to the app's built-in placeholder treatment. Network access is needed for this optional feature; the core catalogue and game logic are local.

## Production

Run `npm run build`, then `npm run preview` to inspect the production build locally. Deploy the generated `dist/` directory using Vercel or another static host. Test the deployed URL before sharing it.
