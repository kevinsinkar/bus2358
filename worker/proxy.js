// Optional Cloudflare Worker: a tiny CORS proxy for CapMetro's live vehicle feed.
// Only needed if the browser blocks the direct request from your GitHub Pages site.
// Deploy: Cloudflare dashboard > Workers & Pages > Create > paste this > Deploy.
// Then put the worker URL in CONFIG.PROXY_URL in app.js.

const FEED = "https://data.austintexas.gov/download/cuc7-ywmd/application/json";
// Replace with your Pages origin, e.g. "https://yourname.github.io"
const ALLOWED_ORIGIN = "https://kevinsinkar.github.io";

export default {
  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const upstream = await fetch(FEED, { cf: { cacheTtl: 10, cacheEverything: true } });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=10" },
    });
  },
};
