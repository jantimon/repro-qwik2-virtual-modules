# Qwik 2 Router: virtual CSS modules break in dev

A Vite plugin can serve CSS as a virtual module, as CSS-in-JS libraries do. With Qwik Router in dev (`vite --mode ssr`), such a stylesheet is never styled: the router links it under a URL that returns 404. If the plugin uses the usual `\0` prefix for the module id, the dev server also crashes on the first page request.

- **Issue:** [QwikDev/qwik#9085](https://github.com/QwikDev/qwik/issues/9085)
- **Fix:** [QwikDev/qwik#9086](https://github.com/QwikDev/qwik/pull/9086)

```ts
// vite.config.ts
const virtualCss = (id: string, resolvedId: string, css: string): Plugin => ({
  name: `virtual-css:${id}`,
  resolveId: (source) => (source === id ? resolvedId : undefined),
  load: (source) => (source === resolvedId ? css : undefined),
});

export default defineConfig({
  plugins: [
    virtualCss("virtual:theme.css", "\0virtual:theme.css", "body { background: rgb(255, 0, 0); }"),
    virtualCss("virtual:plain.css", "virtual:plain.css", "h1 { font-style: italic; }"),
    qwikRouter(),
    qwikVite(),
  ],
});
```

```tsx
// src/routes/index.tsx
import "./global.css";
import "virtual:theme.css";
import "virtual:plain.css";
```

## Run it

```sh
npm install
npm run dev            # vite --mode ssr: open http://localhost:5173/ and the dev server crashes
npm run repro          # requests the page and checks every stylesheet the router links
npm run repro:patched  # same, with the fix below applied to the router's lib/vite/index.mjs
```

`npm run repro` listens for file watcher errors, so the dev server stays up long enough to check the links.

## Results

`@qwik.dev/core` and `@qwik.dev/router` 2.0.0-beta.45, and the same with the nightly from `main` (`5abe616`):

| stylesheet | href | status | css served |
|---|---|---:|---|
| `./global.css` | `/src/routes/global.css` | 200 | yes |
| `virtual:theme.css` | `/virtual:theme.css` | 404 | no |
| `virtual:plain.css` | `/irtual:plain.css` | 404 | no |

File watcher error: `The argument 'path' must be a string, Uint8Array, or URL without null bytes. Received '\x00virtual:theme.css'`. Without a listener, as in `npm run dev`, this error crashes the dev server:

```
TypeError [ERR_INVALID_ARG_VALUE]: The argument 'path' must be a string, Uint8Array, or URL without null bytes. Received '\x00virtual:theme.css'
    at Object.stat (node:fs:1663:16)
    ...
    at FSWatcher.add (node_modules/vite/dist/node/chunks/node.js:12095:23)
    at watcher.add (node_modules/vite/dist/node/chunks/node.js:16771:14)
    at getCssUrls (node_modules/@qwik.dev/router/lib/vite/index.mjs:2035:34)
Emitted 'error' event on FSWatcher instance at:
    at FSWatcher._handleError (node_modules/vite/dist/node/chunks/node.js:12255:146)
```

With the fix:

| stylesheet | href | status | css served |
|---|---|---:|---|
| `./global.css` | `/src/routes/global.css` | 200 | yes |
| `virtual:theme.css` | `/@id/__x00__virtual:theme.css` | 200 | yes |
| `virtual:plain.css` | `/@id/virtual:plain.css` | 200 | yes |

No file watcher errors.

## Cause

Qwik loads no module on the client at startup, so in dev the router links the CSS of the page itself. [`getCssUrls`](https://github.com/QwikDev/qwik/blob/5abe616/packages/qwik-router/src/buildtime/vite/dev-middleware.ts#L204-L244) collects every CSS module of the module graph and [`getRouterIndexTags`](https://github.com/QwikDev/qwik/blob/5abe616/packages/qwik-router/src/buildtime/vite/dev-middleware.ts#L246-L251) links it as `base + url.slice(1)`.

For a file, `mod.url` starts with `/`. For a virtual module, `mod.url` and `mod.file` are the plugin's resolved id:

| module | `mod.url` | `mod.file` |
|---|---|---|
| `./global.css` | `/src/routes/global.css` | `/…/src/routes/global.css` |
| `virtual:theme.css` | `\0virtual:theme.css` | `\0virtual:theme.css` |
| `virtual:plain.css` | `virtual:plain.css` | `virtual:plain.css` |

So `url.slice(1)` drops the `\0` or the first letter, and the link points to a URL Vite does not serve. Vite serves virtual modules under `/@id/`, with a leading `\0` written as `__x00__`. Then [`server.watcher.add(mod.file)`](https://github.com/QwikDev/qwik/blob/5abe616/packages/qwik-router/src/buildtime/vite/dev-middleware.ts#L236-L238) passes the id with the null byte to the file watcher, which throws.

Qwik 1 had the same 404 in its dev server, fixed in [#8351](https://github.com/QwikDev/qwik/pull/8351) with `toDevServerHref`. The Qwik 2 router has its own copy of this code without that fix.

## Fix

Link a virtual module under `/@id/` with the `\0` written as `__x00__`, as Vite's own `wrapId` does, and only watch modules whose URL is a file path:

```ts
// the same as Vite's own wrapId: `\0virtual:theme.css` -> `/@id/__x00__virtual:theme.css`
const toDevServerUrl = (url: string) =>
  url.startsWith("/") ? url : `/@id/${url.replace("\0", "__x00__")}`;

// in getCssUrls
cssModules.add(`${toDevServerUrl(mod.url)}${mod.lastHMRTimestamp ? `?t=${mod.lastHMRTimestamp}` : ""}`);
if (mod.file && mod.url.startsWith("/")) {
  server.watcher.add(mod.file);
}
```

[`scripts/patch.mjs`](scripts/patch.mjs) applies the same change to the published `lib/vite/index.mjs` for `repro:patched`, then restores the original file.
