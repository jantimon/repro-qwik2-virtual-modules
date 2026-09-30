// Links virtual CSS modules under the url Vite serves them at and keeps them out of the
// file watcher (in @qwik.dev/router@2.0.0-beta.45 lib/vite/index.mjs)
// `node scripts/patch.mjs` applies it, `node scripts/patch.mjs --restore` undoes it
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const file = "node_modules/@qwik.dev/router/lib/vite/index.mjs";
const backup = `${file}.orig`;

if (process.argv.includes("--restore")) {
  if (existsSync(backup)) copyFileSync(backup, file);
  process.exit(0);
}

if (!existsSync(backup)) copyFileSync(file, backup);
const src = readFileSync(backup, "utf8");
const replacements = [
  [
    "var getRouterIndexTags = (server) => {",
    `var toDevServerUrl = (url) => {
	if (url.startsWith("/")) return url;
	return url.startsWith("\\0") ? \`/@id/__x00__\${url.slice(1)}\` : \`/@id/\${url}\`;
};
var getRouterIndexTags = (server) => {`,
  ],
  [
    "cssModules.add(`${mod.url}${mod.lastHMRTimestamp",
    "cssModules.add(`${toDevServerUrl(mod.url)}${mod.lastHMRTimestamp",
  ],
  ["if (mod.file) server.watcher.add(mod.file);", 'if (mod.file && mod.url.startsWith("/")) server.watcher.add(mod.file);'],
];
let out = src;
for (const [before, after] of replacements) {
  if (out.split(before).length !== 2) throw new Error(`not found: ${before}`);
  out = out.replace(before, after);
}
writeFileSync(file, out);
