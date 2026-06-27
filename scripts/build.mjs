import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("dist", { recursive: true });

const common = {
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "browser",
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
};

await Promise.all([
  build({
    ...common,
    entryPoints: ["src/backend.ts"],
    outfile: "dist/backend.js",
  }),
  build({
    ...common,
    entryPoints: ["src/frontend.ts"],
    outfile: "dist/frontend.js",
  }),
]);
