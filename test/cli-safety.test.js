#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const bin = path.join(__dirname, "..", "bin", "old-gsd-cleanup.js");

function runWithHome(home, args = ["--dry-run", "--skip-npm"]) {
  return cp.spawnSync(process.execPath, [bin, ...args], {
    cwd: path.dirname(bin),
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });
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
  assert.doesNotMatch(result.stdout, /delete cache .*\.cache\/gsd/);
});

withTempHome((home) => {
  write(
    path.join(home, ".cache", "gsd", "get-shit-done-cc", "data.txt"),
    "Cache for get-shit-done-cc and @gsd-build/sdk."
  );

  const result = runWithHome(home);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /delete cache .*\.cache\/gsd\/get-shit-done-cc/);
  assert.doesNotMatch(result.stdout, /delete cache .*\.cache\/gsd\s*$/m);
});

console.log("cli safety tests passed");
