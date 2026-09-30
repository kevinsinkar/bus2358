// Local preview server: serves the site and proxies the CapMetro feed at /feed,
// so the browser makes a same-origin request and CORS never comes up.
// Not used on GitHub Pages. Usage: node scripts/dev_server.js [port]
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FEED = "https://data.austintexas.gov/download/cuc7-ywmd/application/json";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
const port = Number(process.argv[2]) || 8358;

http.createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/feed") {
    try {
      const r = await fetch(FEED, { redirect: "follow" });
      const body = Buffer.from(await r.arrayBuffer());
      res.writeHead(r.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(body);
    } catch (e) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("feed proxy error: " + e.message);
    }
    return;
  }
  const file = path.normalize(path.join(ROOT, pathname === "/" ? "index.html" : pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
}).listen(port, () => console.log("Bus 2358 tracker: http://localhost:" + port));
