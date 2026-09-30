import { qwikVite } from "@qwik.dev/core/optimizer";
import { qwikRouter } from "@qwik.dev/router/vite";
import { defineConfig, type Plugin } from "vite";

// Plugins that serve CSS as virtual modules, the way CSS-in-JS libraries do. The first
// resolves to an id with the \0 prefix, the Rollup convention for virtual modules. The
// second resolves to the bare id
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
