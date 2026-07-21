import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

function isPackagingIgnored(relativePath, isDirectory) {
  const normalized = relativePath.split(sep).join("/");
  const parts = normalized.split("/");
  const name = parts.at(-1);
  const ignoredDirectories = [
    "games/needlewhile/design/source",
  ];
  const ignoredFiles = new Set([
    "games/needlewhile/design/concept-v1-realistic.png",
    "games/needlewhile/skills/needlewhile/app/public/assets/anime-background.png",
    "games/needlewhile/skills/needlewhile/app/public/assets/felt-background.jpg",
    "games/needlewhile/skills/needlewhile/app/public/assets/wool-ball-anime.png",
    "games/needlewhile/skills/needlewhile/app/public/assets/wool-ball.png",
  ]);
  if (parts.some((part) => [".git", "node_modules", ".media", "browser-profile"].includes(part))) return true;
  if (ignoredDirectories.some((directory) => normalized === directory || normalized.startsWith(`${directory}/`))) return true;
  if (ignoredFiles.has(normalized)) return true;
  if (isDirectory) return false;
  if ([".DS_Store", "Thumbs.db", "server.json"].includes(name)) return true;
  if (name === ".env.example") return false;
  if (name === ".env" || name === ".env.local" || name.startsWith(".env.")) return true;
  return name.endsWith(".swp") || name.endsWith(".log") || name.endsWith(".zip") || name.endsWith(".zip.sha256");
}

function verifySha256Manifest(baseDir, manifestPath) {
  const normalizedBase = resolve(baseDir);
  const normalizedManifest = resolve(manifestPath);
  const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/);
  assert(lines.length > 0, `${manifestPath} is empty`);
  const listedPaths = [];
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64}) {2}(.+)$/);
    assert(match, `${manifestPath} contains an invalid entry: ${line}`);
    listedPaths.push(match[2]);
    const absolute = resolve(normalizedBase, match[2]);
    assert(
      absolute.startsWith(`${normalizedBase}${sep}`),
      `${manifestPath} points outside its package: ${match[2]}`,
    );
    const actual = createHash("sha256").update(readFileSync(absolute)).digest("hex");
    assert(actual === match[1], `SHA-256 mismatch for ${match[2]}`);
  }

  assert(new Set(listedPaths).size === listedPaths.length, `${manifestPath} contains duplicate paths`);

  const packagedPaths = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const relative = absolute.slice(normalizedBase.length + 1);
      if (isPackagingIgnored(relative, entry.isDirectory())) continue;
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (resolve(absolute) !== normalizedManifest) {
        packagedPaths.push(relative.split(sep).join("/"));
      }
    }
  }
  walk(normalizedBase);

  const expected = packagedPaths.sort();
  const listed = [...listedPaths].sort();
  const expectedSet = new Set(expected);
  const listedSet = new Set(listed);
  const unlisted = expected.filter((path) => !listedSet.has(path));
  const missing = listed.filter((path) => !expectedSet.has(path));
  assert(unlisted.length === 0, `${manifestPath} omits packaged files: ${unlisted.join(", ")}`);
  assert(missing.length === 0, `${manifestPath} lists missing files: ${missing.join(", ")}`);
  return lines.length;
}

const codexMarketplace = readJson(join(ROOT, ".agents", "plugins", "marketplace.json"));
const claudeMarketplace = readJson(join(ROOT, ".claude-plugin", "marketplace.json"));
const gameCatalog = readJson(join(ROOT, "games", "catalog.json"));
const releaseManifest = readJson(join(GAME_DIR, "release-manifest.json"));
const codexGameManifest = readJson(join(GAME_DIR, ".codex-plugin", "plugin.json"));
const rootReadme = readFileSync(join(ROOT, "README.md"), "utf8");
const installationGuide = readFileSync(join(ROOT, "docs", "INSTALLATION.md"), "utf8");
const rootInstallerPaths = [join(ROOT, "install.sh"), join(ROOT, "install.ps1")];
const rootInstallers = rootInstallerPaths.map((path) => readFileSync(path, "utf8"));

assert(codexMarketplace.name === "jieya", "Codex marketplace must be named jieya");
assert(claudeMarketplace.name === "jieya", "Claude marketplace must be named jieya");
assert(codexMarketplace.interface?.displayName === "Coder Massage / coder马杀鸡", "Codex marketplace display name mismatch");
assert(gameCatalog.schemaVersion === 1, "game catalog schema version mismatch");
assert(gameCatalog.collection?.productName === "Coder Massage", "game catalog product name mismatch");
assert(gameCatalog.collection?.technicalId === "jieya", "game catalog technical ID must remain jieya");

const allowedStatuses = new Set(["concept", "experimental", "available", "retired"]);
const categoryIds = gameCatalog.categories.map((category) => category.id);
assert(new Set(categoryIds).size === categoryIds.length, "game catalog category IDs must be unique");
const gameIds = gameCatalog.games.map((game) => game.id);
assert(new Set(gameIds).size === gameIds.length, "game catalog game IDs must be unique");
const lifecycleOwnerId = gameCatalog.runtime?.lifecycleOwnerGameId;
assert(typeof lifecycleOwnerId === "string" && gameIds.includes(lifecycleOwnerId), "game catalog must name exactly one valid lifecycle owner");
assert(gameCatalog.runtime?.lifecycleOwnerPluginId === "needlewhile@jieya", "lifecycle owner plugin ID must remain needlewhile@jieya");
assert(gameCatalog.runtime?.lifecycleOwnerSourcePath === "./needlewhile", "lifecycle owner source path must remain ./needlewhile");
assert(gameCatalog.runtime?.currentSelectionMode === "hardwired-single-game", "current game selection mode must remain hardwired-single-game");
assert(gameCatalog.runtime?.plannedBundledCatalogPath === "./needlewhile/collection/catalog.json", "planned bundled catalog path mismatch");
for (const game of gameCatalog.games) {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.id), `invalid game ID: ${game.id}`);
  assert(allowedStatuses.has(game.status), `invalid status for ${game.id}: ${game.status}`);
  assert(categoryIds.includes(game.category), `unknown category for ${game.id}: ${game.category}`);
  assert(/^\.\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(game.path), `unsafe game path for ${game.id}: ${game.path}`);
  const gameDirectory = join(ROOT, "games", game.path);
  assert(existsSync(gameDirectory), `missing game directory for ${game.id}: ${game.path}`);
  if (game.status !== "available") {
    assert(game.distribution?.bundled !== true, `${game.id} cannot be bundled before it is available`);
    assert(game.distribution?.installable !== true, `${game.id} cannot be installable before it is available`);
    assert(game.distribution?.marketplace !== true, `${game.id} cannot enter a marketplace before it is available`);
  }
  if (game.distribution?.installable) {
    assert(game.distribution?.bundled === true, `${game.id} installable distribution must be bundled`);
  }
  if (game.distribution?.marketplace) {
    assert(game.status === "available", `${game.id} marketplace entry requires available status`);
    assert(game.distribution?.installable === true, `${game.id} marketplace entry requires installable distribution`);
    assert(game.id === lifecycleOwnerId, `${game.id} cannot own a marketplace entry; ${lifecycleOwnerId} is the lifecycle owner`);
  }
  if (game.portal?.eligible) {
    assert(game.status === "available", `${game.id} cannot be Portal-eligible before it is available`);
    assert(game.distribution?.installable === true, `${game.id} cannot be Portal-eligible before it is installable`);
    assert(Number.isFinite(game.portal.randomWeight) && game.portal.randomWeight > 0, `${game.id} Portal weight must be positive`);
  }
  if (game.id !== lifecycleOwnerId) {
    for (const forbidden of ["hooks", "hooks.json", "install.sh", "install.ps1", ".mcp.json", ".codex-plugin", ".claude-plugin"]) {
      assert(!existsSync(join(gameDirectory, forbidden)), `${game.id} must not define lifecycle-owner file ${forbidden}`);
    }
  }
}

const installableGames = gameCatalog.games
  .filter((game) => game.status === "available" && game.distribution?.installable)
  .map((game) => game.id)
  .sort();
assert(JSON.stringify(installableGames) === JSON.stringify(["needlewhile"]), "current tester install set must be exactly needlewhile");

const marketplaceGames = gameCatalog.games
  .filter((game) => game.status === "available" && game.distribution?.installable && game.distribution?.marketplace)
  .sort((a, b) => a.id.localeCompare(b.id));
const codexPlugins = [...(codexMarketplace.plugins || [])].sort((a, b) => a.name.localeCompare(b.name));
const claudePlugins = [...(claudeMarketplace.plugins || [])].sort((a, b) => a.name.localeCompare(b.name));
assert(codexPlugins.length === marketplaceGames.length, "Codex marketplace must match installable game catalog");
assert(claudePlugins.length === marketplaceGames.length, "Claude marketplace must match installable game catalog");
for (let index = 0; index < marketplaceGames.length; index += 1) {
  const game = marketplaceGames[index];
  const expectedPath = `./games/${game.path.replace(/^\.\//, "")}`;
  assert(codexPlugins[index]?.name === game.id, `Codex marketplace game mismatch: ${game.id}`);
  assert(codexPlugins[index]?.source?.path === expectedPath, `Codex marketplace path mismatch: ${game.id}`);
  assert(claudePlugins[index]?.name === game.id, `Claude marketplace game mismatch: ${game.id}`);
  assert(claudePlugins[index]?.source === expectedPath, `Claude marketplace path mismatch: ${game.id}`);
}
const needlewhileGame = gameCatalog.games.find((game) => game.id === "needlewhile");
const codexNeedlewhile = codexMarketplace.plugins?.find((plugin) => plugin.name === "needlewhile");
const claudeNeedlewhile = claudeMarketplace.plugins?.find((plugin) => plugin.name === "needlewhile");
assert(needlewhileGame?.id === lifecycleOwnerId, "Needlewhile must remain the single lifecycle owner");
assert(needlewhileGame?.distribution?.codexPluginId === "needlewhile@jieya", "Needlewhile catalog plugin ID mismatch");
assert(needlewhileGame?.path === "./needlewhile", "Needlewhile catalog source path mismatch");
assert(codexNeedlewhile?.source?.path === "./games/needlewhile", "Needlewhile Codex marketplace source mismatch");
assert(claudeNeedlewhile?.source === "./games/needlewhile", "Needlewhile Claude marketplace source mismatch");
assert(codexGameManifest.name === "needlewhile", "Needlewhile Codex plugin manifest name mismatch");
assert(codexGameManifest.version === releaseManifest.version, "Needlewhile Codex plugin and release versions must match");
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
assert(rootReadme.includes("Coder Massage / coder马杀鸡"), "README must use the public product name");
assert(rootReadme.includes("Needlewhile / 扎会儿"), "README must identify the current game");
assert(rootReadme.includes("AI gap time"), "README must explain the product's core interval");
for (const filename of ["README.md", "README.zh-CN.md", "README.ja.md", "README.ko.md", "README.hi.md"]) {
  const readme = readFileSync(join(ROOT, filename), "utf8");
  assert(readme.includes("Coder Massage / coder马杀鸡"), `${filename} must use the canonical product name`);
  assert(readme.includes("Needlewhile / 扎会儿"), `${filename} must identify the current game`);
  assert(readme.includes("docs/INSTALLATION.md"), `${filename} must link to the installation guide`);
  assert(readme.includes("games/README.md"), `${filename} must link to the game catalog`);
}
assert(installationGuide.includes("When the repository is public"), "installation guide must document public GitHub download");
assert(installationGuide.includes("When it is private"), "installation guide must document authenticated private GitHub access");
assert(installationGuide.includes("sh ./install.sh --codex"), "installation guide must document the ZIP-safe shell install command");
assert(installationGuide.includes("sh ./install.sh --verify"), "installation guide must document the post-trust verification command");
assert(installationGuide.includes("Automation boundary"), "installation guide must document the owner-only Hook trust boundary");
assert(installationGuide.includes("Upgrade an existing Codex installation"), "installation guide must document upgrades");
assert(installationGuide.includes("marketplace add magicfanshanghai-sys/jieya --ref main"), "installation guide must document stale marketplace recovery");
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
  join(ROOT, "README.zh-CN.md"),
  join(ROOT, "README.ja.md"),
  join(ROOT, "README.ko.md"),
  join(ROOT, "README.hi.md"),
  join(ROOT, "docs", "INSTALLATION.md"),
  join(ROOT, "docs", "ARCHITECTURE.md"),
  join(ROOT, "docs", "PORTAL.md"),
  join(ROOT, "docs", "ADDING_A_GAME.md"),
  join(ROOT, "games", "README.md"),
  join(ROOT, "games", "catalog.json"),
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

console.log("✓ Coder Massage catalog, five-language entry points, install contract, and repository architecture verify");

const child = spawnSync(process.execPath, [join(GAME_DIR, "scripts", "validate.mjs")], {
  cwd: GAME_DIR,
  encoding: "utf8",
});

if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
if (child.status !== 0) process.exit(child.status ?? 1);

console.log("✓ Coder Massage / jieya compatibility validation passed");
