#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const bin = path.join(__dirname, "..", "bin", "old-gsd-cleanup.js");

function runWithHome(home, args = ["--dry-run", "--skip-npm"], cwd = path.dirname(bin), envOverrides = {}, input = "") {
  const appData = path.join(home, "AppData", "Roaming");
  const localAppData = path.join(home, "AppData", "Local");
  const homeRoot = path.parse(home).root;
  const homePath = `${path.sep}${path.relative(homeRoot, home)}`;
  const result = cp.spawnSync(process.execPath, [bin, ...args], {
    cwd,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      HOMEDRIVE: homeRoot.replace(/[\\/]$/, "") || "C:",
      HOMEPATH: homePath,
      APPDATA: appData,
      LOCALAPPDATA: localAppData,
      ...envOverrides,
    },
    encoding: "utf8",
    input,
  });
  result.stdout = result.stdout.replace(/\\/g, "/");
  result.stderr = result.stderr.replace(/\\/g, "/");
  return result;
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function withTempHome(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "old-gsd-cleanup-test-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

withTempHome((home) => {
  write(
    path.join(home, ".codex", "open-gsd", "get-shit-done-redux", "get-shit-done", "bin", "sample.md"),
    "Migration note mentions github.com/gsd-build and @opengsd/get-shit-done-redux."
  );

  const result = runWithHome(home);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /No legacy install artifacts found/);
  assert.doesNotMatch(result.stdout, /delete cache/);
  assert.doesNotMatch(result.stdout, /get-shit-done-redux\/get-shit-done/);
});

withTempHome((home) => {
  write(
    path.join(home, ".codex", "get-shit-done", "bin", "old.md"),
    "Installed by get-shit-done-cc from @gsd-build/sdk."
  );

  const result = runWithHome(home);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /\.codex\/get-shit-done/);
});

withTempHome((home) => {
  write(
    path.join(home, ".cache", "gsd", "new-opengsd-cache", "data.txt"),
    "Cache for @opengsd/get-shit-done-redux."
  );

  const result = runWithHome(home);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /No legacy GSD cache artifacts found/);
  assert.doesNotMatch(result.stdout, /\.cache\/gsd/);
});

withTempHome((home) => {
  write(
    path.join(home, ".cache", "gsd", "get-shit-done-cc", "data.txt"),
    "Cache for get-shit-done-cc and @gsd-build/sdk."
  );

  const result = runWithHome(home);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /\.cache\/gsd\/get-shit-done-cc/);
  assert.doesNotMatch(result.stdout, /\.cache\/gsd\s*$/m);
});

withTempHome((home) => {
  const target = path.join(home, ".cache", "gsd", "get-shit-done-cc", "data.txt");
  write(target, "Cache for get-shit-done-cc and @gsd-build/sdk.");

  const result = runWithHome(home, ["--skip-npm"]);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /Non-interactive terminal detected/);
  assert.ok(fs.existsSync(target));
});

withTempHome((home) => {
  const target = path.join(home, ".codex", "get-shit-done", "README.md");
  write(target, "Installed by get-shit-done-cc from @gsd-build/sdk.");

  const result = runWithHome(home, ["--skip-npm"], path.dirname(bin), {}, "a\n");
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(target));
});

withTempHome((home) => {
  write(
    path.join(home, ".codex", "get-shit-done", "README.md"),
    "Installed by get-shit-done-cc from @gsd-build/sdk. Migrate to @opengsd/get-shit-done-redux."
  );

  const result = runWithHome(home);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /\.codex\/get-shit-done/);
});

withTempHome((home) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "old-gsd-cleanup-cwd-"));
  try {
    write(
      path.join(cwd, ".github", "workflows", "gsd-build.yml"),
      "uses get-shit-done-cc from @gsd-build/sdk"
    );

    const result = runWithHome(home, ["--dry-run", "--skip-npm"], cwd);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /\.github\/workflows\/gsd-build\.yml/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

withTempHome((home) => {
  write(
    path.join(home, "AppData", "Roaming", "Cursor", "skills", "gsd-old", "SKILL.md"),
    "Installed by get-shit-done-cc from @gsd-build/sdk."
  );

  const result = runWithHome(home);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /AppData\/Roaming\/Cursor/);
});

withTempHome((home) => {
  const customCodexHome = path.join(home, "custom-codex");
  write(
    path.join(customCodexHome, "skills", "gsd-old", "SKILL.md"),
    "Installed by get-shit-done-cc from @gsd-build/sdk."
  );

  const result = runWithHome(home, ["--dry-run", "--skip-npm"], path.dirname(bin), {
    CODEX_HOME: customCodexHome,
  });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /custom-codex\/skills\/gsd-old/);
});

withTempHome((home) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "old-gsd-cleanup-cwd-"));
  try {
    write(
      path.join(cwd, ".github", "skills", "gsd-old", "SKILL.md"),
      "Installed by get-shit-done-cc from @gsd-build/sdk."
    );

    const result = runWithHome(home, ["--dry-run", "--skip-npm"], cwd);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /\.github\/skills\/gsd-old/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

withTempHome((home) => {
  write(
    path.join(home, ".hermes", "skills", "gsd", "old", "SKILL.md"),
    "Installed by get-shit-done-cc from @gsd-build/sdk."
  );

  const result = runWithHome(home);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /\.hermes\/skills\/gsd/);
});

console.log("cli safety tests passed");
