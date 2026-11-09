# Cardboard NU

An unofficial course planner for Northwestern students. Pick the classes you want, grouped by requirement ("take all of these", "pick 2 of these"), and Cardboard NU assigns every class to a quarter and a section so nothing overlaps. Anything that can't fit is greyed out with the reason, such as "Always clashes with IEMS 307" or "Fits if you drop ART 272".

Not affiliated with Northwestern University. Times come from the public [class descriptions](https://class-descriptions.northwestern.edu/) site. Always confirm in CAESAR and with your adviser.

## Features

- Search every undergraduate and 400-level course from the last four non-summer terms, including special-topics names.
- Requirement groups you define, with optional rules: "same quarter as" (lecture + lab), "only after" (sequences), and "can take more than once".
- Conflict-free schedules across any quarters you choose. Quarters that aren't published yet use the same quarter last year and are marked as estimates.
- Lock a class to a quarter, cap courses per quarter, choose how to spread the load, and step through other arrangements that also work.
- Plans save in your browser. Share them as a link, or export and import them as JSON.

## Run it locally

```bash
node scripts/serve.mjs
```

Then open http://localhost:8123. The page loads its data with `fetch`, so opening `index.html` straight from disk won't work.

## Refresh the course data

```bash
node scripts/scrape.mjs
```

This scrapes the four most recent non-summer terms into `data/` in about a minute. To scrape specific terms, pass their IDs (for example `node scripts/scrape.mjs 5050 5040`); the IDs are in the class descriptions site's URLs. The GitHub Action in `.github/workflows/refresh-data.yml` runs the same command every Monday and commits any changes.

## Deploy to GitHub Pages

1. Create a repository on GitHub (for example `cardboard-nu`) and push this folder to it.
2. In the repository, go to **Settings → Pages**, set **Source** to "Deploy from a branch", and choose `main` / `(root)`.
3. In **Settings → Actions → General**, under "Workflow permissions", choose "Read and write permissions" so the weekly refresh can commit new data.

The site will be at `https://<your-username>.github.io/cardboard-nu/`.

## Files

| Path | What it is |
|---|---|
| `index.html`, `style.css`, `app.js` | The site |
| `solver.js` | Scheduling engine (also runs in Node) |
| `data/*.json` | Scraped sections per term; `data/terms.json` lists them |
| `scripts/scrape.mjs` | Data scraper |
| `scripts/serve.mjs` | Local dev server |
