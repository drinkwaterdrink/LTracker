import { readFile } from "node:fs/promises";

const backend = await readFile("dist/backend.js", "utf8");
const blocked = [
  "fs",
  "node:fs",
  "readFileSync",
  "Bun.file",
  "Bun.write",
  "Bun.spawn",
  "child_process",
  "worker_threads",
  "cluster",
  "net",
  "tls",
  "dgram",
  "node:sqlite",
  "bun:sqlite",
  "process.env",
  "process.exit",
  "eval(",
  "Function(",
  "new Function",
];

const findings = blocked.filter((pattern) => backend.includes(pattern));
if (findings.length > 0) {
  console.error(`Backend scanner found blocked patterns: ${findings.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("Backend scanner passed.");
}
