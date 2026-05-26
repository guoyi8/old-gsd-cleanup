#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const cp = require("child_process");

const VERSION = "1.0.1";

const args = new Set(process.argv.slice(2));

const options = {
  dryRun: args.has("--dry-run"),
  yes: args.has("--yes") || args.has("-y"),
  skipNpm: args.has("--skip-npm"),
  runOldNpx: args.has("--run-old-npx"),
  skipFileScan: args.has("--skip-file-scan"),
  help: args.has("--help") || args.has("-h"),
  version: args.has("--version") || args.has("-v"),
};

if (options.version) {
  console.log(VERSION);
  process.exit(0);
}

if (options.help) {
  printHelp();
  process.exit(0);
}

if ([...args].some((arg) => arg === "--allow-npx-old-gsd")) {
  console.error("Error: --allow-npx-old-gsd was renamed to --run-old-npx for clarity.");
  process.exit(2);
}

if ([...args].some((arg) => arg.startsWith("-") && ![
  "--dry-run",
  "--yes",
  "-y",
  "--skip-npm",
  "--run-old-npx",
  "--skip-file-scan",
  "--help",
  "-h",
  "--version",
  "-v",
].includes(arg))) {
  console.error(`Error: unknown option in: ${process.argv.slice(2).filter((arg) => arg.startsWith("-")).join(" ")}`);
  console.error("Run with --help for usage.");
  process.exit(2);
}

main().catch((err) => {
  console.error(`\nFatal: ${err.stack || err.message}`);
  process.exit(1);
});

async function main() {
  banner();

  if (!options.skipNpm) {
    runNpmCleanup();
  } else {
    logStep("Skipping npm cleanup (--skip-npm).");
  }

  if (options.skipFileScan) {
    logStep("Skipping runtime file scan (--skip-file-scan).");
  } else {
    await scanAndConfirmOldRuntimeFiles();
    await cleanupCaches();
  }

  console.log("\nDone.");
  console.log("This tool targets legacy gsd-build/get-shit-done only and does not uninstall @opengsd/* packages.");
}

function printHelp() {
  console.log(`old-gsd-cleanup ${VERSION}

Remove legacy gsd-build/get-shit-done packages and old runtime traces.

Usage:
  npx old-gsd-cleanup
  npx old-gsd-cleanup --yes
  npx old-gsd-cleanup --run-old-npx --yes

Options:
  --yes, -y          Delete matched old runtime files without per-file prompts.
  --dry-run          Print commands and matched files without deleting files.
  --skip-npm         Skip npm uninstall/cache cleanup commands.
  --run-old-npx      Also run "npx get-shit-done-cc --uninstall ..." after npm uninstall.
                     This executes the legacy package again, so it is opt-in.
  --skip-file-scan   Skip scanning runtime config directories for old-package markers.
  --help, -h         Show help.
  --version, -v      Show version.

Scope:
  Removes/uninstalls: get-shit-done-cc, @gsd-build/sdk, files that mention
  get-shit-done-cc, @gsd-build, gsd-build/get-shit-done, or github.com/gsd-build.

  Does not uninstall: @opengsd/get-shit-done-redux, @opengsd/gsd-sdk, @opengsd/gsd-pi.
`);
}

function banner() {
  console.log("== old-gsd-cleanup ==");
  console.log("Target: legacy gsd-build/get-shit-done packages only.");
  console.log("Safe boundary: @opengsd/* packages are not removed.");
  if (options.dryRun) console.log("Mode: dry-run.");
}

function logStep(message) {
  console.log(`\n== ${message} ==`);
}

function runNpmCleanup() {
  logStep("Running npm cleanup commands");

  run("npm", ["uninstall", "-g", "get-shit-done-cc"]);
  run("npm", ["uninstall", "-g", "@gsd-build/sdk"]);

  if (options.runOldNpx) {
    console.log("\nWarning: --run-old-npx executes the legacy package through npx.");
    run("npx", ["--yes", "get-shit-done-cc", "--uninstall", "--global"]);
    run("npx", ["--yes", "get-shit-done-cc", "--uninstall", "--local"]);
  } else {
    console.log("\nSkipped legacy npx uninstallers.");
    console.log("Use --run-old-npx if you explicitly want to run:");
    console.log("  npx get-shit-done-cc --uninstall --global");
    console.log("  npx get-shit-done-cc --uninstall --local");
  }

  run("npm", ["cache", "clean", "--force"]);
}

function run(command, commandArgs) {
  console.log(`$ ${command} ${commandArgs.join(" ")}`);
  if (options.dryRun) return;

  const result = cp.spawnSync(command, commandArgs, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.warn(`warn: failed to run ${command}: ${result.error.message}`);
    return;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    console.warn(`warn: command exited with status ${result.status}`);
  }
}

async function scanAndConfirmOldRuntimeFiles() {
  logStep("Scanning runtime config directories for legacy markers");

  const roots = runtimeRoots();
  const targets = new Map();

  for (const root of roots) {
    if (!existsDir(root)) continue;
    for (const file of walkFiles(root)) {
      if (shouldSkipFile(file)) continue;
      if (!containsLegacyMarker(file)) continue;
      if (isProtectedOpenGsdPath(root, file)) continue;

      const target = cleanupTargetForLegacyFile(root, file);
      if (target && containsOpenGsdMarker(file) && !isStrongLegacyTarget(root, target)) continue;
      if (target) targets.set(target, target);
    }
  }

  const matches = [...targets.keys()].sort();

  if (matches.length === 0) {
    console.log("No legacy install artifacts found.");
    return;
  }

  console.log(`Found ${matches.length} legacy install artifact(s):\n`);
  for (const file of matches) console.log(`  ${file}`);

  await confirmAndDelete(matches);
}

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function runtimeRoots() {
  const home = os.homedir();
  const xdgConfigHome = process.env.XDG_CONFIG_HOME ? expandTilde(process.env.XDG_CONFIG_HOME) : path.join(home, ".config");
  const roots = [
    envDir("CLAUDE_CONFIG_DIR") || path.join(home, ".claude"),
    envDir("CODEX_HOME") || path.join(home, ".codex"),
    envDir("CURSOR_CONFIG_DIR") || path.join(home, ".cursor"),
    envDir("TRAE_CONFIG_DIR") || path.join(home, ".trae"),
    envDir("COPILOT_CONFIG_DIR") || path.join(home, ".copilot"),
    envDir("GEMINI_CONFIG_DIR") || path.join(home, ".gemini"),
    envDir("ANTIGRAVITY_CONFIG_DIR") || path.join(home, ".gemini", "antigravity"),
    envDir("OPENCODE_CONFIG_DIR") || envConfigFileDir("OPENCODE_CONFIG") || path.join(xdgConfigHome, "opencode"),
    envDir("KILO_CONFIG_DIR") || envConfigFileDir("KILO_CONFIG") || path.join(xdgConfigHome, "kilo"),
    envDir("WINDSURF_CONFIG_DIR") || path.join(home, ".codeium", "windsurf"),
    envDir("AUGMENT_CONFIG_DIR") || path.join(home, ".augment"),
    envDir("QWEN_CONFIG_DIR") || path.join(home, ".qwen"),
    envDir("HERMES_HOME") || path.join(home, ".hermes"),
    envDir("CODEBUDDY_CONFIG_DIR") || path.join(home, ".codebuddy"),
    envDir("CLINE_CONFIG_DIR") || path.join(home, ".cline"),
  ];

  roots.push(...localRuntimeRoots());
  return unique(roots);
}

function localRuntimeRoots() {
  const cwd = process.cwd();
  return [
    ".claude",
    ".opencode",
    ".gemini",
    ".kilo",
    ".codex",
    path.join(".github", "skills"),
    ".agent",
    ".cursor",
    ".windsurf",
    ".augment",
    ".trae",
    ".qwen",
    ".hermes",
    ".codebuddy",
    ".cline",
  ].map((entry) => path.join(cwd, entry));
}

function envDir(name) {
  return process.env[name] ? expandTilde(process.env[name]) : null;
}

function envConfigFileDir(name) {
  return process.env[name] ? path.dirname(expandTilde(process.env[name])) : null;
}

function expandTilde(filePath) {
  if (filePath && filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

async function cleanupCaches() {
  logStep("Cleaning legacy GSD cache directories");

  const home = os.homedir();
  const dirs = [
    path.join(home, ".cache", "gsd"),
    path.join(home, ".local", "share", "gsd"),
  ];

  if (process.platform === "darwin") {
    dirs.push(path.join(home, "Library", "Caches", "gsd"));
  }

  if (process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, "gsd"));
  if (process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, "gsd"));

  const targets = new Map();
  for (const dir of unique(dirs)) {
    if (!existsDir(dir)) continue;
    for (const file of walkFiles(dir)) {
      if (shouldSkipFile(file)) continue;
      if (!containsStrongLegacyMarker(file)) continue;
      if (isProtectedOpenGsdPath(dir, file)) continue;

      const target = cleanupTargetForLegacyCacheFile(dir, file);
      if (target && containsOpenGsdMarker(file) && !isStrongLegacyTarget(dir, target)) continue;
      if (target) targets.set(target, target);
    }
  }

  const matches = [...targets.keys()].sort();
  if (matches.length === 0) {
    console.log("No legacy GSD cache artifacts found.");
    return;
  }

  console.log(`Found ${matches.length} legacy GSD cache artifact(s):\n`);
  for (const target of matches) {
    console.log(`  ${target}`);
  }
  await confirmAndDelete(matches);
}

function existsDir(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function walkFiles(root) {
  const files = [];
  const stack = [root];
  const ignoredDirs = new Set([
    "node_modules",
    ".git",
    "projects",
    "sessions",
    "archived_sessions",
    "history",
    "logs",
    "tool-results",
    "Cache",
    "Code Cache",
    "GPUCache",
    "IndexedDB",
    "Service Worker",
  ]);

  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function shouldSkipFile(file) {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 2 * 1024 * 1024) return true;
  } catch {
    return true;
  }

  const base = path.basename(file).toLowerCase();
  if (base === ".codex-global-state.json" || base.startsWith(".codex-global-state.json.")) return true;

  return [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".sqlite",
    ".db",
    ".bin",
    ".lock",
    ".zip",
    ".gz",
    ".tgz",
    ".br",
  ].some((ext) => base.endsWith(ext));
}

function readTextFile(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function containsLegacyMarker(file) {
  const marker = /get-shit-done-cc|@gsd-build|gsd-build\/get-shit-done|github\.com\/gsd-build/i;
  return marker.test(readTextFile(file));
}

function containsStrongLegacyMarker(file) {
  const marker = /get-shit-done-cc|@gsd-build|gsd-build\/get-shit-done/i;
  return marker.test(readTextFile(file));
}

function containsOpenGsdMarker(file) {
  const marker = /@opengsd|open-gsd\/get-shit-done-redux|github\.com\/open-gsd\/get-shit-done-redux/i;
  return marker.test(readTextFile(file));
}

function isProtectedOpenGsdPath(root, file) {
  const rel = path.relative(root, file);
  if (!rel || rel.startsWith("..")) return false;

  const parts = rel.split(path.sep).map((part) => part.toLowerCase());
  return parts.includes("@opengsd") ||
    parts.includes("get-shit-done-redux") ||
    parts.includes("open-gsd");
}

function cleanupTargetForLegacyFile(root, file) {
  const rel = path.relative(root, file);
  if (!rel || rel.startsWith("..")) return null;
  if (isProtectedOpenGsdPath(root, file)) return null;

  const parts = rel.split(path.sep);
  const lowerParts = parts.map((part) => part.toLowerCase());

  if (path.basename(root).toLowerCase() === "skills" && parts[0] && /^gsd[-_:]/i.test(parts[0])) {
    return path.join(root, parts[0]);
  }

  const getShitDoneIndex = lowerParts.indexOf("get-shit-done");
  if (getShitDoneIndex >= 0 && containsStrongLegacyMarker(file)) {
    return path.join(root, ...parts.slice(0, getShitDoneIndex + 1));
  }

  const backupIndex = lowerParts.indexOf("gsd-user-files-backup");
  if (backupIndex >= 0) {
    return path.join(root, ...parts.slice(0, backupIndex + 1));
  }

  const journalIndex = lowerParts.indexOf("gsd-migration-journal");
  if (journalIndex >= 0) {
    return path.join(root, ...parts.slice(0, journalIndex + 1));
  }

  const skillsIndex = lowerParts.indexOf("skills");
  if (skillsIndex >= 0 && parts[skillsIndex + 1] &&
      (parts[skillsIndex + 1].toLowerCase() === "gsd" || /^gsd[-_:]/i.test(parts[skillsIndex + 1]))) {
    return path.join(root, ...parts.slice(0, skillsIndex + 2));
  }

  const commandsIndex = lowerParts.indexOf("commands");
  if (commandsIndex >= 0) {
    const next = parts[commandsIndex + 1] || "";
    if (/^gsd([-_:].*)?$/i.test(next)) {
      return path.join(root, ...parts.slice(0, commandsIndex + 2));
    }
    if (/^gsd[-_:]/i.test(path.basename(file))) return file;
  }

  const agentsIndex = lowerParts.indexOf("agents");
  if (agentsIndex >= 0 && /^gsd[-_:]/i.test(path.basename(file))) {
    return file;
  }

  const hooksIndex = lowerParts.indexOf("hooks");
  if (hooksIndex >= 0 && /^gsd[-_:]/i.test(path.basename(file))) {
    return file;
  }

  const rulesIndex = lowerParts.indexOf("rules");
  if (rulesIndex >= 0 && /^gsd[-_:]/i.test(path.basename(file))) {
    return file;
  }

  const base = path.basename(file);
  if (base === ".clinerules" || /^gsd[-_:]/i.test(base)) {
    return file;
  }

  return null;
}

function cleanupTargetForLegacyCacheFile(root, file) {
  const rel = path.relative(root, file);
  if (!rel || rel.startsWith("..")) return null;
  if (isProtectedOpenGsdPath(root, file)) return null;

  const parts = rel.split(path.sep);
  const firstPart = parts[0];
  const firstLower = firstPart.toLowerCase();
  if (/^(get-shit-done|get-shit-done-cc|gsd-build|@gsd-build)$/i.test(firstPart)) {
    return path.join(root, firstPart);
  }
  if (/^gsd[-_:].*legacy/i.test(firstLower) || /^legacy[-_:].*gsd/i.test(firstLower)) {
    return path.join(root, firstPart);
  }

  return file;
}

function isStrongLegacyTarget(root, target) {
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith("..")) return false;

  const parts = rel.split(path.sep).map((part) => part.toLowerCase());
  return parts.includes("get-shit-done") ||
    parts.includes("get-shit-done-cc") ||
    parts.includes("@gsd-build") ||
    parts.includes("gsd-build") ||
    parts.includes("gsd-user-files-backup") ||
    parts.includes("gsd-migration-journal");
}

function removePath(file) {
  try {
    fs.rmSync(file, { recursive: true, force: true });
    console.log(`deleted ${file}`);
  } catch (err) {
    console.warn(`warn: failed to delete ${file}: ${err.message}`);
  }
}

async function confirmAndDelete(matches) {
  if (options.dryRun) return;

  if (options.yes) {
    for (const file of matches) removePath(file);
    return;
  }

  if (!process.stdin.isTTY) {
    console.log("\nNon-interactive terminal detected; not deleting files without --yes.");
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    for (const file of matches) {
      const answer = await ask(rl, `Delete ${file}? [y/N] `);
      const normalized = answer.trim().toLowerCase();
      if (normalized === "y" || normalized === "yes") removePath(file);
    }
  } finally {
    rl.close();
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
