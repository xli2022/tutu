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

**One-time setup (required):** in
[**Settings → Pages**](https://github.com/xli2022/tutu/settings/pages), set
**Source** to **GitHub Actions**. A workflow cannot do this for you — its
`GITHUB_TOKEN` may deploy to Pages but is not allowed to enable Pages, so until
the setting is flipped every run fails at *Configure Pages* with
`Get Pages site failed. Error: Not Found`.

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
