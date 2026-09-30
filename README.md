# Bus 2358 Tracker

A static GitHub Pages site. Press the button: it checks CapMetro's live vehicle feed for bus **2358** and, if it's in service, drops a dot on a map over the route it's running. If it isn't reporting, the page says it's not in service.

## Deploy (about 5 minutes)

1. Create a new GitHub repo and upload everything in this folder (keep the `.github` folder).
2. **Settings > Pages**: set Source to "Deploy from a branch", branch `main`, folder `/ (root)`.
3. **Actions** tab: run **Update route data** once (Run workflow). It downloads CapMetro's schedule data and commits `data/routes.json` and `data/trips.json` (the route lines). It then refreshes daily.
4. Open `https://<your-username>.github.io/<repo-name>/` and press the button.

## The CORS proxy (required)

Browsers block the direct feed request: CapMetro's download URL answers with a redirect that
carries no CORS header, so the fetch fails cross-origin. A tiny Cloudflare Worker
(`worker/proxy.js`) fetches the feed server-side and adds the header. It is deployed at
`https://bus2358-feed.kevin-sinkar.workers.dev` and set in `CONFIG.PROXY_URL` in `app.js`.

To redeploy it after a change (needs a free Cloudflare account):

```
cd worker
npx wrangler deploy
```

`ALLOWED_ORIGIN` in `worker/proxy.js` limits the proxy to this site's origin.

## Local preview

```
node scripts/dev_server.js    # serves the site at http://localhost:8358 and proxies the feed at /feed
```

## Changing the bus

Edit `CONFIG.BUS_ID` in `app.js`.

## How "in service" is decided

The bus counts as in service if it appears in the live feed with a position less than 10 minutes old (`STALE_SECONDS`). The feed only lists buses that are currently reporting, so "not in service" means "not in service right now", which can include a bus that ran earlier today.

## Data sources

- Live positions: CapMetro Vehicle Positions JSON (data.austintexas.gov, dataset `cuc7-ywmd`), updated about every 15 seconds.
- Route lines: CapMetro GTFS (data.texas.gov, dataset `r4v4-vz24`). If the download link in `scripts/build_data.py` ever breaks, update `GTFS_URL`.

## Tests

```
node tests/test_app.js
python3 tests/test_build_data.py   # writes sample data into data/; delete data/routes.json and data/trips.json afterward
```
