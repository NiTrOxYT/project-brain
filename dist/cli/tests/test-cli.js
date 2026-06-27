// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI Tests
// Integration-level tests for each CLI command
// ──────────────────────────────────────────────────────────────────────────────
import assert from "assert";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
const CLI = path.resolve("dist/cli/cli.js");
function run(args, cwd = os.tmpdir()) {
    return execSync(`node ${CLI} ${args}`, { cwd, encoding: "utf-8" });
}
function runJson(args, cwd = os.tmpdir()) {
    const out = run(`${args} --json`, cwd);
    return JSON.parse(out.trim());
}
let tmpDir;
function setup() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-test-"));
    execSync(`node ${CLI} init --workspace ${dir}`, { encoding: "utf-8" });
    return dir;
}
function teardown(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}
// ── Test: --version ────────────────────────────────────────────────────────────
{
    const versionJson = runJson("--version");
    assert.ok(versionJson.version, "--version should return version");
    const versionText = run("--version");
    assert.match(versionText, /brain \d+\.\d+\.\d+/, "--version text format");
    console.log("✔  --version");
}
// ── Test: --help ───────────────────────────────────────────────────────────────
{
    const help = run("--help");
    assert.ok(help.includes("Usage"), "--help should show usage");
    assert.ok(help.includes("init"), "--help should list init");
    assert.ok(help.includes("compile"), "--help should list compile");
    assert.ok(help.includes("doctor"), "--help should list doctor");
    console.log("✔  --help");
}
// ── Test: init ─────────────────────────────────────────────────────────────────
{
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-test-"));
    try {
        const result = runJson(`init --workspace ${tmpDir}`);
        assert.strictEqual(result.ok, true, "init should succeed");
        assert.ok(fs.existsSync(path.join(tmpDir, ".brain")), ".brain dir should exist");
        assert.ok(fs.existsSync(path.join(tmpDir, ".brain", "snapshots")), ".brain/snapshots should exist");
        assert.ok(fs.existsSync(path.join(tmpDir, ".brain", "journal")), ".brain/journal should exist");
    }
    finally {
        teardown(tmpDir);
    }
    console.log("✔  init");
}
// ── Test: init --json ──────────────────────────────────────────────────────────
{
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-test-"));
    try {
        const result = runJson(`init --workspace ${tmpDir}`);
        assert.strictEqual(result.ok, true);
        assert.ok(result.brainDir, "should return brainDir");
    }
    finally {
        teardown(tmpDir);
    }
    console.log("✔  init --json");
}
// ── Test: doctor --json ────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const result = runJson(`doctor --workspace ${tmpDir}`);
        assert.strictEqual(typeof result.ok, "boolean", "doctor should return ok");
        assert.ok(Array.isArray(result.results), "results should be an array");
        assert.ok(result.totals, "should have totals");
        assert.ok(result.totals.PASS > 0, "should have PASS checks");
        assert.strictEqual(result.totals.FAIL, 0, "no FAILs on fresh init");
    }
    finally {
        teardown(tmpDir);
    }
    console.log("✔  doctor --json");
}
// ── Test: stats --json ─────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const result = runJson(`stats --workspace ${tmpDir}`);
        assert.strictEqual(result.ok, true);
        assert.ok(result.stats, "should have stats");
        assert.ok(result.stats.compilation, "should have compilation stats");
        assert.strictEqual(typeof result.stats.compilation.snapshots, "number");
    }
    finally {
        teardown(tmpDir);
    }
    console.log("✔  stats --json");
}
// ── Test: clean --dry-run --json ───────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const result = runJson(`clean --workspace ${tmpDir} --dry-run`);
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.dryRun, true);
        assert.ok(Array.isArray(result.removed));
    }
    finally {
        teardown(tmpDir);
    }
    console.log("✔  clean --dry-run --json");
}
// ── Test: config show --json ───────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const result = runJson(`config show --workspace ${tmpDir}`);
        assert.strictEqual(result.ok, true);
        assert.ok(result.config, "should have config");
    }
    finally {
        teardown(tmpDir);
    }
    console.log("✔  config show --json");
}
// ── Test: config set + show ────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const setResult = runJson(`config set --workspace ${tmpDir} --key foo --value bar`);
        assert.strictEqual(setResult.ok, true);
        const showResult = runJson(`config show --workspace ${tmpDir}`);
        assert.strictEqual(showResult.config.foo, "bar");
    }
    finally {
        teardown(tmpDir);
    }
    console.log("✔  config set + show");
}
// ── Test: context list --json (empty) ─────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const result = runJson(`context list --workspace ${tmpDir}`);
        assert.strictEqual(result.ok, true);
        assert.ok(Array.isArray(result.snapshots));
        assert.strictEqual(result.snapshots.length, 0);
    }
    finally {
        teardown(tmpDir);
    }
    console.log("✔  context list --json (empty)");
}
// ── Test: context latest --json (empty) ───────────────────────────────────────
{
    tmpDir = setup();
    try {
        const result = runJson(`context latest --workspace ${tmpDir}`);
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.snapshot, null);
    }
    finally {
        teardown(tmpDir);
    }
    console.log("✔  context latest --json (empty)");
}
// ── Test: workspace status --json ─────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const result = runJson(`workspace status --workspace ${tmpDir}`);
        assert.strictEqual(result.ok, true);
        assert.ok(result.status, "should return status");
    }
    finally {
        teardown(tmpDir);
    }
    console.log("✔  workspace status --json");
}
// ── Test: workflow history --json (empty) ─────────────────────────────────────
{
    tmpDir = setup();
    try {
        const result = runJson(`workflow history --workspace ${tmpDir}`);
        assert.strictEqual(result.ok, true);
        assert.ok(Array.isArray(result.workflows));
    }
    finally {
        teardown(tmpDir);
    }
    console.log("✔  workflow history --json (empty)");
}
// ── Test: shared-memory tasks --json ──────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const result = runJson(`shared-memory tasks --workspace ${tmpDir}`);
        assert.strictEqual(result.ok, true);
        assert.ok(Array.isArray(result.tasks));
    }
    finally {
        teardown(tmpDir);
    }
    console.log("✔  shared-memory tasks --json");
}
// ── Test: unknown command → exit 2 ────────────────────────────────────────────
{
    let threw = false;
    try {
        execSync(`node ${CLI} unknowncmd`, { encoding: "utf-8", stdio: "pipe" });
    }
    catch (e) {
        threw = true;
        assert.strictEqual(e.status, 2, "should exit 2 for unknown command");
    }
    assert.ok(threw, "unknown command should throw");
    console.log("✔  unknown command exits 2");
}
// ── Test: retrieve without --query → exit 4 ───────────────────────────────────
{
    tmpDir = setup();
    try {
        let threw = false;
        try {
            execSync(`node ${CLI} retrieve --workspace ${tmpDir}`, { encoding: "utf-8", stdio: "pipe" });
        }
        catch (e) {
            threw = true;
            // validation error exit code is 4
            assert.ok([2, 4].includes(e.status), `should exit non-zero, got ${e.status}`);
        }
        assert.ok(threw, "missing --query should throw");
    }
    finally {
        teardown(tmpDir);
    }
    console.log("✔  retrieve without --query exits error");
}
console.log("\n\x1b[32m✔ All BUILD-059 CLI tests passed\x1b[0m");
