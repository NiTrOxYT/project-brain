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

function run(args: string, cwd = process.cwd()): string {
    return execSync(`node --import tsx ${CLI} ${args}`, { cwd, encoding: "utf-8" });
}

function runJson(args: string, cwd = process.cwd()): any {
    const out = run(`${args} --json`, cwd);
    return JSON.parse(out.trim());
}

let tmpDir: string;

function setup(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-test-"));
    // Initialize workspace
    execSync(`node ${CLI} init --workspace ${dir}`, { encoding: "utf-8" });
    return dir;
}

function teardown(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

console.log("Starting BUILD-059 CLI Integration Tests...\n");

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

// ── Test: subcommand --help ────────────────────────────────────────────────────
{
    const help = run("compile --help");
    assert.ok(help.includes("Usage: brain compile"), "should print specific compile help");
    console.log("✔  subcommand --help");
}

// ── Test: init ─────────────────────────────────────────────────────────────────
{
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-test-"));
    try {
        const result = runJson(`init --workspace ${tmpDir}`);
        assert.strictEqual(result.ok, true, "init should succeed");
        assert.ok(fs.existsSync(path.join(tmpDir, ".brain")), ".brain dir should exist");
        assert.ok(fs.existsSync(path.join(tmpDir, ".brain", "snapshots")), ".brain/snapshots should exist");
        assert.ok(fs.existsSync(path.join(tmpDir, ".brain", "journal")),   ".brain/journal should exist");
    } finally {
        teardown(tmpDir);
    }
    console.log("✔  init");
}

// ── Test: compile ──────────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        // Create a dummy file to compile
        fs.writeFileSync(path.join(tmpDir, "dummy.ts"), "export const a = 1;");
        const result = runJson(`compile --workspace ${tmpDir}`);
        assert.strictEqual(result.ok, true);
        assert.ok(result.snapshotId);
        assert.strictEqual(result.files, 1);
    } finally {
        teardown(tmpDir);
    }
    console.log("✔  compile");
}

// ── Test: sync ─────────────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        fs.writeFileSync(path.join(tmpDir, "dummy.ts"), "export const a = 2;");
        const result = runJson(`sync --workspace ${tmpDir}`);
        assert.strictEqual(result.ok, true);
        assert.ok(result.snapshotId);
    } finally {
        teardown(tmpDir);
    }
    console.log("✔  sync");
}

// ── Test: retrieve ─────────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        fs.writeFileSync(path.join(tmpDir, "dummy.ts"), "export const a = 3;");
        run(`compile --workspace ${tmpDir}`);
        const result = runJson(`retrieve --workspace ${tmpDir} --query "export const a"`);
        assert.strictEqual(result.ok, true);
        assert.ok(Array.isArray(result.package.sections));
    } finally {
        teardown(tmpDir);
    }
    console.log("✔  retrieve");
}

// ── Test: query ────────────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        fs.writeFileSync(path.join(tmpDir, "dummy.ts"), "export const a = 4;");
        run(`compile --workspace ${tmpDir}`);
        const result = runJson(`query --workspace ${tmpDir} --query "dummy.ts"`);
        assert.strictEqual(result.ok, true);
    } finally {
        teardown(tmpDir);
    }
    console.log("✔  query");
}

// ── Test: workflow ─────────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const history = runJson(`workflow history --workspace ${tmpDir}`);
        assert.strictEqual(history.ok, true);
        assert.ok(Array.isArray(history.workflows));

        const status = runJson(`workflow status --workspace ${tmpDir} --workflow-id wf-dummy`);
        assert.strictEqual(status.ok, true);
        assert.strictEqual(status.state, "Pending");
    } finally {
        teardown(tmpDir);
    }
    console.log("✔  workflow subcommands");
}

// ── Test: runtime ──────────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const status = runJson(`runtime status --workspace ${tmpDir}`);
        assert.strictEqual(status.ok, true);
        assert.strictEqual(status.status, "idle");
    } finally {
        teardown(tmpDir);
    }
    console.log("✔  runtime subcommands");
}

// ── Test: workspace ────────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const status = runJson(`workspace status --workspace ${tmpDir}`);
        assert.strictEqual(status.ok, true);
        assert.ok(status.status);

        const txns = runJson(`workspace transactions --workspace ${tmpDir}`);
        assert.strictEqual(txns.ok, true);
        assert.ok(Array.isArray(txns.transactions));

        const locks = runJson(`workspace locks --workspace ${tmpDir}`);
        assert.strictEqual(locks.ok, true);
        assert.ok(Array.isArray(locks.locks));

        const journal = runJson(`workspace journal --workspace ${tmpDir}`);
        assert.strictEqual(journal.ok, true);
        assert.ok(Array.isArray(journal.entries));
    } finally {
        teardown(tmpDir);
    }
    console.log("✔  workspace subcommands");
}

// ── Test: provider ─────────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const list = runJson(`provider list --workspace ${tmpDir}`);
        assert.strictEqual(list.ok, true);
        assert.ok(Array.isArray(list.providers));

        const health = runJson(`provider health --workspace ${tmpDir}`);
        assert.strictEqual(health.ok, true);
        assert.ok(Array.isArray(health.health));
    } finally {
        teardown(tmpDir);
    }
    console.log("✔  provider subcommands");
}

// ── Test: learning ─────────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const stats = runJson(`learning statistics --workspace ${tmpDir}`);
        assert.strictEqual(stats.ok, true);
        assert.ok(stats.statistics);
    } finally {
        teardown(tmpDir);
    }
    console.log("✔  learning subcommands");
}

// ── Test: shared-memory ────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const status = runJson(`shared-memory status --workspace ${tmpDir}`);
        assert.strictEqual(status.ok, true);
        assert.ok(status.status);

        const agents = runJson(`shared-memory agents --workspace ${tmpDir}`);
        assert.strictEqual(agents.ok, true);
        assert.ok(Array.isArray(agents.agents));

        const tasks = runJson(`shared-memory tasks --workspace ${tmpDir}`);
        assert.strictEqual(tasks.ok, true);
        assert.ok(Array.isArray(tasks.tasks));

        const conflicts = runJson(`shared-memory conflicts --workspace ${tmpDir}`);
        assert.strictEqual(conflicts.ok, true);
        assert.ok(Array.isArray(conflicts.conflicts));

        const consensus = runJson(`shared-memory consensus --workspace ${tmpDir}`);
        assert.strictEqual(consensus.ok, true);
        assert.ok(Array.isArray(consensus.proposals));

        const stats = runJson(`shared-memory statistics --workspace ${tmpDir}`);
        assert.strictEqual(stats.ok, true);

        const diag = runJson(`shared-memory diagnostics --workspace ${tmpDir}`);
        assert.strictEqual(diag.ok, true);
    } finally {
        teardown(tmpDir);
    }
    console.log("✔  shared-memory subcommands");
}

// ── Test: doctor ───────────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const result = runJson(`doctor --workspace ${tmpDir}`);
        assert.strictEqual(typeof result.ok, "boolean");
        assert.ok(Array.isArray(result.results));
        assert.ok(result.totals);
        assert.strictEqual(result.totals.FAIL, 0);
    } finally {
        teardown(tmpDir);
    }
    console.log("✔  doctor");
}

// ── Test: stats ────────────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const result = runJson(`stats --workspace ${tmpDir}`);
        assert.strictEqual(result.ok, true);
        assert.ok(result.stats);
    } finally {
        teardown(tmpDir);
    }
    console.log("✔  stats");
}

// ── Test: clean ────────────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const result = runJson(`clean --workspace ${tmpDir} --dry-run`);
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.dryRun, true);
    } finally {
        teardown(tmpDir);
    }
    console.log("✔  clean");
}

// ── Test: config ───────────────────────────────────────────────────────────────
{
    tmpDir = setup();
    try {
        const show = runJson(`config show --workspace ${tmpDir}`);
        assert.strictEqual(show.ok, true);
        assert.ok(show.config);

        const set = runJson(`config set --workspace ${tmpDir} --key compiler.incremental --value false`);
        assert.strictEqual(set.ok, true);
        assert.strictEqual(set.value, false);

        const reset = runJson(`config reset --workspace ${tmpDir}`);
        assert.strictEqual(reset.ok, true);
    } finally {
        teardown(tmpDir);
    }
    console.log("✔  config");
}

// ── Test: exit codes ───────────────────────────────────────────────────────────
{
    // 1. Unknown Command -> Validation error code 2
    let threw = false;
    try {
        execSync(`node ${CLI} unknowncommand`, { encoding: "utf-8", stdio: "pipe" });
    } catch (e: any) {
        threw = true;
        assert.strictEqual(e.status, 2, "exit code should be 2 for validation error");
    }
    assert.ok(threw);

    // 2. Missing required flags -> Validation error code 2
    threw = false;
    tmpDir = setup();
    try {
        try {
            execSync(`node ${CLI} retrieve --workspace ${tmpDir}`, { encoding: "utf-8", stdio: "pipe" });
        } catch (e: any) {
            threw = true;
            assert.strictEqual(e.status, 2, "exit code should be 2 for validation error");
        }
        assert.ok(threw);
    } finally {
        teardown(tmpDir);
    }

    // 3. Workspace not initialized -> Workspace error code 3
    threw = false;
    const missingDir = path.join(os.tmpdir(), "nonexistent-brain-workspace");
    try {
        execSync(`node ${CLI} compile --workspace ${missingDir}`, { encoding: "utf-8", stdio: "pipe" });
    } catch (e: any) {
        threw = true;
        assert.strictEqual(e.status, 3, "exit code should be 3 for workspace error");
    }
    assert.ok(threw);

    console.log("✔  exit codes (validation/workspace/success)");
}

console.log("\n\x1b[32m✔ All BUILD-059 CLI integration tests passed!\x1b[0m");
