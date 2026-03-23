# Strava Sport Dashboard

A browser-based Strava running analytics dashboard focused on **training load**, **segment PBs**, and **coach-ready exports**.

## Highlights

- OAuth login with Strava API (client-side token exchange)
- Dashboard metrics for:
  - Weekly/monthly distance and run counts
  - Recent pace and heart rate
  - ACWR, efficiency index, cadence, elevation density
  - Training distribution insights (quality run ratio, HR delta, long-run share)
- PB tracking for:
  - 1K / 3K / 5K / 10K (full-run + rolling segment bests when splits are available)
- Activity details:
  - Splits table
  - Heart-rate / pace chart
- Data export:
  - Per-run JSON
  - Aggregate JSON
  - Aggregate Markdown report
- Local cache (IndexedDB):
  - Activities list
  - Per-run detail bundles
  - Cache fallback when API is temporarily unavailable

## Tech Stack

- Vanilla HTML/CSS/JavaScript (ES Modules)
- Chart.js for charts
- Node test runner (`node --test`) for analytics tests

## Project Structure

- `index.html`: app layout and dashboard sections
- `style.css`: styles, responsive behavior, accessibility polish
- `app.js`: UI orchestration, OAuth flow, Strava API integration, caching, exports
- `analytics.js`: pure analytics functions and formatting utilities
- `tests/analytics.test.js`: unit tests for analytics behavior

## Prerequisites

- Node.js 18+
- A Strava application with:
  - Client ID
  - Client Secret
  - Redirect URI pointing to your local/dev app URL

## Local Development

```bash
npm install
python -m http.server 8000
# open http://localhost:8000
```

> Do not run directly with `file://` because OAuth redirect/token flow requires HTTP origin.

## Available Scripts

```bash
npm run check   # syntax check for app.js
npm test        # run analytics test suite
```

## Strava Setup

1. Open the app in browser.
2. Enter Strava `Client ID` and `Client Secret` in setup panel.
3. Save settings.
4. Click **Connect Strava** and complete OAuth consent.
5. Dashboard loads activities and metrics.

## Caching Strategy (IndexedDB)

Stores:

- `run_activities`: cached run activity list
- `run_bundles`: cached per-run detail and stream payloads

Behavior:

- Activity list fetch writes cache on success.
- If activity API fails and cache exists, app falls back to cached data.
- Detail fetch reads cache first, then API on miss.
- Logout / clear settings clears local tokens and cache.

## Export Formats

### Per-run JSON

Contains selected summary, detail, and streams for one activity.
Filename format:

- `YYYY-MM-DD_<sanitized_run_name>.json`

### Aggregate JSON

Contains all loaded runs in a single export payload:

- metadata (`exported_at`, `run_count`)
- runs[] with summary/detail/streams

### Aggregate Markdown

Human-readable report with per-run summary and split table snippets.

## Accessibility / UX Notes

- Skip-link for keyboard/screen-reader users
- Quick navigation anchors for major sections
- Focus-visible outlines for interactive controls
- Reduced-motion media query support

## Testing Scope

Current automated tests cover analytics logic, including:

- Week/month totals
- Timezone-safe date parsing
- Comparable-distance pace delta
- Full-run PB detection (1K/3K/5K/10K)
- Rolling segment effort logic
- VDOT prediction behavior
- Advanced distribution metrics

## Known Limitations

- OAuth token exchange is done on the client side for simplicity.
  - Suitable for personal/internal use; production apps should move secret handling server-side.
- No server-side persistence; cache is browser-local only.
- Visual interaction tests are manual.

## Troubleshooting

- **OAuth fails on local file path**: run via HTTP server.
- **No activities found**: verify Strava account has `Run` activities.
- **Stale/invalid tokens**: clear auth and reconnect.
- **Unexpected UI state after merge**: run `npm run check` and verify `app.js` has no conflict markers.

## License

Internal project / no license specified.
