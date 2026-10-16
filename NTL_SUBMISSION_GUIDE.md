# TasteEvolving — NTL handoff guide

## 1. Replace your local project safely

1. Keep a backup of your current TasteEvolving folder.
2. Extract this ZIP to a new folder, for example `C:\C(VISUAL STUDIO)\TasteEvolving-Simplified`.
3. Open the extracted folder in VS Code. The folder containing `package.json` is the project root.

## 2. Install and verify

Run these commands in the VS Code terminal at the project root:

```powershell
node -v
npm install
npm run validate:data
npm run build
npm run dev
```

Use Node 22.12+ (Node 22.16+ is suitable). Data validation checks required fields, unique work IDs, factual relationship IDs, and HTTPS source URLs. A successful build creates `dist/`.

## 3. Test the main user flows

- **Taste Bridge:** choose Books or Movies, select one starting title, and click **Find my bridge**. Confirm that the destination is chosen automatically and each route step explains two shared themes, or one theme reinforced by a compatible emotional family, or a cast/director credit. The bridge shows a beginning–turning-point–resolution story card. Try both Hollywood and Bollywood filters, then save a bridge.
- **Connection Chain:** open the game. Multiple-choice mode is selected by default. Choose a next link, inspect the evidence explanation, then switch to free-build mode and test undo.
- **Factual links:** try Shared actor, Same director, Same genre, Shared themes, and Same mood. The curated 2010–2025 movie selection has 55 Hollywood and 52 Bollywood titles. Some 2025 films have official studio or CBFC references; the catalogue is not exhaustive and not every cast entry has an independent source link.
- **Explore:** search for a work, filter by format/mood/theme, switch grid/list views, and start a bridge from a book or movie. Non-book/movie selections are redirected to a related book/movie starting point.
- **Discovery Trails:** add two or more works, reorder them, save the trail, refresh, and restore it. Use **Explore from here** to start a new bridge from a trail item.
- **My Collection:** save a work and a bridge, refresh, and confirm they remain saved.
- **Responsive:** check a laptop width and a narrow mobile viewport. Confirm that the Book/Movie selector, Hollywood/Bollywood filter, destination panel, quiz choices, and navigation fit the screen.

## 4. Push to GitHub

If this is a new repository:

```powershell
git init
git add .
git commit -m "Expand film catalogue and create story-driven bridges"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

If the folder is already connected to the correct repository, do not add the remote again. Check `git remote -v`, then run `git add .`, `git commit -m "Expand film catalogue and create story-driven bridges"`, and `git push`.

## 5. Deploy on Vercel

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: none required for the core app

Run the build locally before pushing or deploying. The current assistant environment could not install npm packages, so a successful production build still needs to be confirmed on your computer.

## Game demo outline

1. Open **Connection Chain**. The game starts in **Choose next link** mode, so users can guess from four options.
2. Explain that thematic links use shared catalogue tags, while actor/director/genre matches use curated catalogue metadata; the original source-backed relationships retain source links, and source coverage is not claimed for every newly added credit.
3. Show the evidence panel after choosing an answer.
4. Switch to **Build your chain** to search for a next work, add a supported link, and undo a step.
5. Complete a round and save the chain as a Discovery Trail.
