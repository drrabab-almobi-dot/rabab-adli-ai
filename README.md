# دليل التواصل العدلي

This is the single source and publishing repository for rabab-adli.com.

- Edit directory records in `src/data/entities.json`. Keep the home search data and no-script rows in `index.html` in sync when editing records.
- Edit site copy in `content/*.mjs` and article bodies in `content/articles/`. Vite generates the static pages and sitemap.
- Use Node 20. Run `npm ci`, then `BASE_PATH=/ npm run build`. The output is in `dist/`. Use `npm run dev` to preview edits.

GitHub Actions builds and deploys Pages automatically on pushes to `main` once the Pages source is set to **GitHub Actions**. Coordinate that one-time setting change with the migration merge because the existing source serves the published files directly from the root of `main`. The workflow can also be started manually from `main`. The custom domain remains rabab-adli.com.
