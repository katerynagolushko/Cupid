// Usage: node server.mjs  ->  http://localhost:3000
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { routes } from "./lib/routes.mjs";

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = join(process.cwd(), "public");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon" };

async function serveStatic(pathname, res) {
  const rel = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  const file = join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = routes[url.pathname];
  if (!route) return serveStatic(url.pathname, res);
  const started = Date.now();
  try {
    const body = await route(url.searchParams);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(body));
    console.log(`${url.pathname}${url.search} 200 ${Date.now() - started}ms`);
  } catch (err) {
    const status = err.status ?? 502;
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: err.message }));
    console.error(`${url.pathname}${url.search} ${status} ${Date.now() - started}ms: ${err.message.slice(0, 300)}`);
  }
}).listen(PORT, () => console.log(`Angel Doors on http://localhost:${PORT}`));
