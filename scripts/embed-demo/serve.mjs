// Serves the embed demo on another origin (http://localhost:5500) — `pnpm embed:demo`.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 5500);
const page = new URL("./index.html", import.meta.url);

createServer(async (req, res) => {
  if (req.url === "/favicon.ico") {
    res.writeHead(204).end();
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(await readFile(page));
}).listen(PORT, () => {
  console.log(`Embed demo: http://localhost:${PORT}/?quiz=<slug>`);
});
