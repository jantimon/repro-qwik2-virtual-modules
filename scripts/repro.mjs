// Starts the dev server the way `vite --mode ssr` does, requests the page and checks every
// stylesheet the router links. A listener on the file watcher records its errors: without
// one, as in `npm run dev`, the first watcher error crashes the dev server
import { createServer } from "vite";

const watcherErrors = [];
const server = await createServer({ mode: "ssr", server: { port: 5199 }, logLevel: "silent" });
server.watcher.on("error", (error) => watcherErrors.push(error.message));
await server.listen();

const base = "http://localhost:5199";
const html = await (await fetch(`${base}/`)).text();
const hrefs = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]*)"/g)].map((m) => m[1]);

console.log("| stylesheet | href | status | css served |");
console.log("|---|---|---:|---|");
for (const [name, marker] of [
  ["./global.css", "rgb(0, 0, 255)"],
  ["virtual:theme.css", "rgb(255, 0, 0)"],
  ["virtual:plain.css", "italic"],
]) {
  // match on the file name: a broken href can lose part of the id
  const href = hrefs.find((h) => h.includes(name.split(/[/:]/).pop()));
  if (!href) {
    console.log(`| ${name} | not linked | | no |`);
    continue;
  }
  const res = await fetch(base + href);
  const body = await res.text();
  console.log(`| ${name} | \`${href}\` | ${res.status} | ${body.includes(marker) ? "yes" : "no"} |`);
}
const unique = [...new Set(watcherErrors)];
console.log(`\nfile watcher errors: ${unique.length ? unique.join("; ") : "none"}`);

await server.close();
process.exit(0);
