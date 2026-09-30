# Bus 2358 Tracker

A static GitHub Pages site. Press the button: it checks CapMetro's live vehicle feed for bus **2358** and, if it's in service, drops a dot on a map over the route it's running. If it isn't reporting, the page says it's not in service.

## Deploy (about 5 minutes)

1. Create a new GitHub repo and upload everything in this folder (keep the `.github` folder).
2. **Settings > Pages**: set Source to "Deploy from a branch", branch `main`, folder `/ (root)`.
3. **Actions** tab: run **Update route data** once (Run workflow). It downloads CapMetro's schedule data and commits `data/routes.json` and `data/trips.json` (the route lines). It then refreshes daily.
4. Open `https://<your-username>.github.io/<repo-name>/` and press the button.

## If it says "Couldn't reach CapMetro's live feed"

Browsers block requests to sites that don't allow cross-origin access (CORS). I couldn't test this from my side. If it happens:

1. Create a free Cloudflare account and a new Worker; paste in `worker/proxy.js`; deploy.
2. Put the Worker URL in `CONFIG.PROXY_URL` at the top of `app.js` and commit.
3. Optional: set `ALLOWED_ORIGIN` in the Worker to `https://<your-username>.github.io`.

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
