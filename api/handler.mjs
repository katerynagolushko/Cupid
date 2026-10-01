// Vercel function: every /api/* request is rewritten here and dispatched to the shared routes.
import { routes } from "../lib/routes.mjs";

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const path = url.searchParams.get("__path") ? `/api/${url.searchParams.get("__path")}` : url.pathname;
  url.searchParams.delete("__path");
  const route = routes[path];
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!route) return res.status(404).end(JSON.stringify({ error: `no route ${path}` }));
  try {
    res.status(200).end(JSON.stringify(await route(url.searchParams)));
  } catch (err) {
    res.status(err.status ?? 502).end(JSON.stringify({ error: err.message }));
  }
}
