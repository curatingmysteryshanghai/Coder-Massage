import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
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
const rootInstallerPaths = [join(ROOT, "install.sh"), join(ROOT, "install.ps1")];
const rootInstallers = rootInstallerPaths.map((path) => readFileSync(path, "utf8"));

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
for (const installer of rootInstallers) {
  assert(installer.includes("needlewhile@jieya"), "root installer must use the canonical Needlewhile plugin ID");
  assert(installer.includes("plugin remove") && installer.includes("needlewhile@needlewhile-local"), "root installer must migrate the legacy plugin ID");
  assert(installer.includes("codex-hook-doctor.mjs"), "root installer must run the Hook doctor");
  assert(installer.includes("codex://plugins/needlewhile@jieya"), "root installer must open the desktop review page");
  assert(installer.includes("NEEDLEWHILE_STATUS=pending"), "root installer must expose pending authorization");
  assert(installer.toLowerCase().includes("version mismatch"), "root installer must reject an outdated plugin version");
  assert(!installer.includes("trusted_hash"), "root installer must not write trusted hashes");
  assert(!installer.includes("config/batchWrite"), "root installer must not write Hook trust");
  assert(!installer.includes("dangerously-bypass-hook-trust"), "root installer must not bypass Hook trust");
}
if (process.platform !== "win32") {
  for (const path of [join(ROOT, "install.sh"), join(GAME_DIR, "install.sh")]) {
    assert((statSync(path).mode & 0o111) !== 0, `${path} must remain executable`);
  }
}

for (const path of [
  join(ROOT, "README.md"),
  join(ROOT, "games", "needlewhile", "README.md"),
  join(ROOT, "games", "needlewhile", "design", "preview.png"),
  join(ROOT, "games", "needlewhile", "design", "concept.png"),
  join(ROOT, "games", "needlewhile", "design", "concept-ver-0.2.png"),
  join(ROOT, "games", "needlewhile", "CLIENT_ADAPTERS.md"),
]) {
  assert(existsSync(path), `Missing collection file: ${path}`);
}

console.log("✓ Jieya Ver.0.2 catalogs, client matrix, and README assets are present");

const child = spawnSync(process.execPath, [join(GAME_DIR, "scripts", "validate.mjs")], {
  cwd: GAME_DIR,
  encoding: "utf8",
});

if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
if (child.status !== 0) process.exit(child.status ?? 1);

console.log("✓ Jieya validation passed");
