# pdf.js 6.4.299, legacy build

Mozilla's PDF reader. Spendscape uses it for one thing: pulling the
positioned text out of a PDF statement, in the browser. It is loaded only
when a PDF is opened, from these files; nothing is fetched from anywhere
else.

| File | Copied unmodified from | SHA-256 |
| --- | --- | --- |
| `pdf.min.js` | `pdfjs-dist@6.4.299/legacy/build/pdf.min.mjs` | `bccc24ea711db8e44503629519904a5292d73b9daaa214bbe7cdcc282b0f4259` |
| `pdf.worker.min.js` | `pdfjs-dist@6.4.299/legacy/build/pdf.worker.min.mjs` | `145d2dd3ab0c86151011dba95acfa2d5336e2accd59388ea43dbee0efddaaec6` |

Renamed from `.mjs` to `.js` only so that every static host serves them
as JavaScript; they are ES modules. The legacy build is used because the
modern one calls functions many current browsers don't have yet
(`Math.sumPrecise`); the legacy build carries core-js polyfills.

Licences: pdf.js is under the Apache License 2.0 (`LICENSE`); the bundled
core-js polyfills are under the MIT License (`LICENSE-core-js`).

To update: `npm pack pdfjs-dist@<version>`, copy the two files from
`package/legacy/build/` under the names above, update the version and
hashes here, and re-run the PDF statement tests.
