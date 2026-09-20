# tutu

Placeholder web app, published to GitHub Pages automatically.

## Layout

```
site/                      # everything that gets published
  index.html
  assets/styles.css
  assets/app.js
  assets/favicon.svg
  .nojekyll                # serve files/dirs starting with "_" as-is
.github/workflows/deploy-pages.yml
```

## Deployment

Every push to `master` runs
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml),
which uploads `site/` and publishes it to GitHub Pages. The workflow can also
be started by hand from the repository's **Actions** tab (*Deploy to GitHub
Pages* → *Run workflow*).

One-time setup: in **Settings → Pages**, set **Source** to **GitHub Actions**.
The workflow passes `enablement: true`, so the first run will usually flip this
for you — set it manually if that run reports Pages is not enabled.

The published URL is `https://xli2022.github.io/tutu/` and is also printed in
the workflow run summary.

## Local preview

No build step, no dependencies — open `site/index.html` directly, or serve it:

```sh
python3 -m http.server -d site 8000   # http://localhost:8000
```

## Replacing the placeholder

Edit the files in `site/`. If you later add a bundler, point the `path:` of the
*Upload site* step at its output directory (for example `./dist`) and add the
build step ahead of it.
