# CPS 230 Companion

An offline, single-file guide to APRA's Prudential Standard CPS 230 Operational Risk Management and its guide CPG 230.

## Use it

Open `dist/cps230.html` in any modern browser. It needs no internet, install or admin rights. When you are online, the Sources page and each paragraph link to the official APRA documents.

## Status

| Phase | Status |
| --- | --- |
| 1. Load official CPS 230 and CPG 230 text | Waiting on access to APRA sites |
| 2. Search and reading view | Shell built and tested with test data |
| 3. Learn and Reference | Not started |
| 4. Impact checker | Not started |
| 5. Polish and release | Not started |

## Update or rebuild

Content lives in `data/` as JSON, keyed to APRA's paragraph numbers. App code is in `src/`. To rebuild the single file:

```
python3 build.py
```

To run the smoke test (builds with `tests/fixture` data, opens it from disk and checks search, filters, escaping and that no network requests are made):

```
node tests/smoke.js
```

## Sources

Only APRA's official text is used. The official versions prevail. This tool is a reference aid, not legal advice or compliance sign-off.
