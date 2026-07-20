import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GAME_DIR = join(ROOT, "games", "needlewhile");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifySha256Manifest(baseDir, manifestPath) {
  const normalizedBase = resolve(baseDir);
  const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/);
  assert(lines.length > 0, `${manifestPath} is empty`);
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64}) {2}(.+)$/);
    assert(match, `${manifestPath} contains an invalid entry: ${line}`);
    const absolute = resolve(normalizedBase, match[2]);
    assert(
      absolute.startsWith(`${normalizedBase}${sep}`),
      `${manifestPath} points outside its package: ${match[2]}`,
    );
    const actual = createHash("sha256").update(readFileSync(absolute)).digest("hex");
    assert(actual === match[1], `SHA-256 mismatch for ${match[2]}`);
  }
  return lines.length;
}

const codexMarketplace = readJson(join(ROOT, ".agents", "plugins", "marketplace.json"));
const claudeMarketplace = readJson(join(ROOT, ".claude-plugin", "marketplace.json"));
const releaseManifest = readJson(join(GAME_DIR, "release-manifest.json"));
const rootReadme = readFileSync(join(ROOT, "README.md"), "utf8");
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
  assert(installer.toLowerCase().includes("verify"), "root installer must expose a post-trust verification mode");
  assert(installer.includes("Restart Codex once"), "root installer must require a post-install/update Codex restart");
  assert(installer.includes("already enabled at version"), "root installer must leave an enabled current version unchanged");
  assert(installer.toLowerCase().includes("version mismatch"), "root installer must reject an outdated plugin version");
  assert(!installer.includes("trusted_hash"), "root installer must not write trusted hashes");
  assert(!installer.includes("config/batchWrite"), "root installer must not write Hook trust");
  assert(!installer.includes("dangerously-bypass-hook-trust"), "root installer must not bypass Hook trust");
}
assert(releaseManifest.installation?.shell === "sh ./install.sh --codex", "release manifest shell install command mismatch");
assert(releaseManifest.installation?.verifyShell === "sh ./install.sh --verify", "release manifest shell verification command mismatch");
assert(releaseManifest.installation?.codexPluginId === "needlewhile@jieya", "release manifest Codex plugin ID mismatch");
assert(releaseManifest.installation?.manualRequirements?.length === 2, "release manifest must list Hook trust and restart requirements");
assert(rootReadme.includes("When the repository is public"), "README must document public GitHub download");
assert(rootReadme.includes("When it is private"), "README must document authenticated private GitHub access");
assert(rootReadme.includes("sh ./install.sh --codex"), "README must document the ZIP-safe shell install command");
assert(rootReadme.includes("sh ./install.sh --verify"), "README must document the post-trust verification command");
assert(rootReadme.includes("Automation boundary"), "README must document the owner-only Hook trust boundary");
assert(rootReadme.includes("Upgrade an existing Codex installation"), "README must document upgrades");
if (process.platform !== "win32") {
  for (const path of [join(ROOT, "install.sh"), join(GAME_DIR, "install.sh")]) {
    assert((statSync(path).mode & 0o111) !== 0, `${path} must remain executable`);
    for (const shell of ["sh", "dash"]) {
      const syntax = spawnSync(shell, ["-n", path], { encoding: "utf8" });
      if (syntax.error?.code === "ENOENT" && shell === "dash") continue;
      assert(syntax.status === 0, `${path} failed ${shell} syntax check: ${syntax.stderr}`);
    }
  }
}

const powershellParser = ["pwsh", "powershell"]
  .map((command) => ({ command, probe: spawnSync(command, ["-NoProfile", "-NonInteractive", "-Command", "exit 0"], { encoding: "utf8" }) }))
  .find(({ probe }) => !probe.error && probe.status === 0)?.command;
if (powershellParser) {
  const parseCommand = [
    "$tokens = $null",
    "$errors = $null",
    "[System.Management.Automation.Language.Parser]::ParseFile($args[0], [ref]$tokens, [ref]$errors) | Out-Null",
    "if ($errors.Count -gt 0) { $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }",
  ].join("; ");
  for (const path of [join(ROOT, "install.ps1"), join(GAME_DIR, "install.ps1")]) {
    const syntax = spawnSync(powershellParser, ["-NoProfile", "-NonInteractive", "-Command", parseCommand, path], { encoding: "utf8" });
    assert(syntax.status === 0, `${path} failed PowerShell syntax check: ${syntax.stderr}`);
  }
} else {
  process.stdout.write("↪ PowerShell syntax parsing skipped: pwsh/powershell is unavailable on this host\n");
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

const rootIntegrityCount = verifySha256Manifest(ROOT, join(ROOT, "MANIFEST.sha256"));
console.log(`✓ Repository SHA-256 manifest verifies ${rootIntegrityCount} packaged files`);

console.log("✓ Jieya catalogs, install/verify contract, shell syntax, and README assets are present");

const child = spawnSync(process.execPath, [join(GAME_DIR, "scripts", "validate.mjs")], {
  cwd: GAME_DIR,
  encoding: "utf8",
});

if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
if (child.status !== 0) process.exit(child.status ?? 1);

console.log("✓ Jieya validation passed");
