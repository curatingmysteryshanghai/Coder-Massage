import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GAME_DIR = join(ROOT, "games", "needlewhile");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const codexMarketplace = readJson(join(ROOT, ".agents", "plugins", "marketplace.json"));
const claudeMarketplace = readJson(join(ROOT, ".claude-plugin", "marketplace.json"));

assert(codexMarketplace.name === "jieya", "Codex marketplace must be named jieya");
assert(claudeMarketplace.name === "jieya", "Claude marketplace must be named jieya");
assert(
  codexMarketplace.plugins?.[0]?.source?.path === "./games/needlewhile",
  "Codex marketplace must point to games/needlewhile",
);
assert(
  claudeMarketplace.plugins?.[0]?.source === "./games/needlewhile",
  "Claude marketplace must point to games/needlewhile",
);

for (const path of [
  join(ROOT, "README.md"),
  join(ROOT, "games", "needlewhile", "README.md"),
  join(ROOT, "games", "needlewhile", "design", "preview.png"),
  join(ROOT, "games", "needlewhile", "design", "concept.png"),
]) {
  assert(existsSync(path), `Missing collection file: ${path}`);
}

console.log("✓ Jieya collection catalogs and README assets are present");

const child = spawnSync(process.execPath, [join(GAME_DIR, "scripts", "validate.mjs")], {
  cwd: GAME_DIR,
  encoding: "utf8",
});

if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
if (child.status !== 0) process.exit(child.status ?? 1);

console.log("✓ Jieya validation passed");
