#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — Main Entry Point
// brain <command> [subcommand] [options]
// ──────────────────────────────────────────────────────────────────────────────
import process from "process";
import { setColorEnabled } from "./utils/colors.js";
import { setLogLevel, setJsonMode } from "./utils/logger.js";
import { resolveWorkspace, resolveProject } from "./utils/paths.js";
import { handleError, EXIT_VALIDATION } from "./utils/errors.js";
const VERSION = "0.1.0";
function parseArgs(argv) {
    const flags = new Map();
    const positionals = [];
    let command;
    let subcommand;
    let i = 0;
    while (i < argv.length) {
        const arg = argv[i];
        if (arg === "--") {
            positionals.push(...argv.slice(i));
            break;
        }
        if (arg.startsWith("--")) {
            const key = arg.slice(2);
            // boolean flags
            if (key === "json" || key === "verbose" || key === "quiet" || key === "no-color"
                || key === "force" || key === "incremental" || key === "watch"
                || key === "full" || key === "dry-run" || key === "help" || key === "version") {
                flags.set(key, true);
            }
            else {
                const next = argv[i + 1];
                if (next && !next.startsWith("--")) {
                    flags.set(key, next);
                    i++;
                }
                else {
                    flags.set(key, true);
                }
            }
        }
        else if (arg.startsWith("-")) {
            // short flags: -v -> verbose, -q -> quiet, -j -> json
            for (const ch of arg.slice(1)) {
                if (ch === "v")
                    flags.set("verbose", true);
                else if (ch === "q")
                    flags.set("quiet", true);
                else if (ch === "j")
                    flags.set("json", true);
                else if (ch === "h")
                    flags.set("help", true);
            }
        }
        else {
            positionals.push(arg);
        }
        i++;
    }
    if (positionals.length > 0)
        command = positionals[0];
    if (positionals.length > 1)
        subcommand = positionals[1];
    return { command, subcommand, flags, positionals };
}
function flag(flags, key) {
    return flags.get(key) === true;
}
function flagStr(flags, key) {
    const v = flags.get(key);
    return typeof v === "string" ? v : undefined;
}
function flagNum(flags, key) {
    const v = flagStr(flags, key);
    return v != null ? Number(v) : undefined;
}
// ── Help text ─────────────────────────────────────────────────────────────────
const HELP = `
\x1b[1mUsage:\x1b[0m  brain <command> [subcommand] [options]

\x1b[1mCommands:\x1b[0m
  init                    Initialize .brain workspace
  compile                 Run Context Compiler
  sync                    Run Context Synchronization
  retrieve                Run Context Retrieval
  query                   Run Query Engine
  workflow <sub>          Autonomous Workflow  (run/resume/cancel/status/history/report/diagnostics)
  runtime  <sub>          Autonomous Runtime   (execute/resume/status)
  shared-memory <sub>     Shared Memory        (status/agents/tasks/conflicts/consensus/snapshot/restore/statistics/diagnostics)
  context  <sub>          Context operations   (latest/list/validate/compact/rollback/delta)
  workspace <sub>         Workspace operations (status/transactions/locks/journal/rollback)
  learning  <sub>         Learning Engine      (learn/recommend/statistics)
  provider  <sub>         Providers            (list/health/benchmark)
  doctor                  Run system diagnostics
  clean                   Remove cache/temp/old data
  stats                   Display aggregated metrics
  config   <sub>          Configuration        (show/set/reset)
  install                 Install Project Brain transparent wrappers
  gateway  <sub>          Orchestrates and manages AI gateway runs, history, metrics, diagnostics, integration
  explain  <session-id>   Describe deterministic session pipeline execution and savings


\x1b[1mGlobal Options:\x1b[0m
  --workspace <path>      Workspace directory  (default: cwd)
  --project   <path>      Project root         (default: cwd)
  --json                  Output as JSON
  --verbose               Show verbose output
  --quiet                 Suppress non-error output
  --no-color              Disable colors
  --help                  Show help
  --version               Show version

\x1b[1mExamples:\x1b[0m
  brain init
  brain compile --force
  brain sync --full
  brain retrieve --query "authentication middleware"
  brain workflow run --issue "Fix login bug"
  brain workflow status --workflow-id wf-12345
  brain doctor
  brain clean --dry-run
  brain stats --json
`;
const COMMAND_HELP = {
    init: `
Usage: brain init [options]

Initialize a new .brain workspace in the target directory.

Options:
  --workspace <path>      Directory to initialize (default: cwd)

Examples:
  brain init
  brain init --workspace /path/to/project
`,
    compile: `
Usage: brain compile [options]

Run the Context Compiler to generate an immutable semantic snapshot of the workspace.

Options:
  --force                 Force a full compilation (rebuild cache)
  --incremental           Force incremental compilation if possible
  --watch                 Watch workspace files for changes and recompile

Examples:
  brain compile
  brain compile --force
  brain compile --watch
`,
    sync: `
Usage: brain sync [options]

Run Context Synchronization to scan changes and update snapshot state.

Options:
  --full                  Force full sync (ignore index cache)
  --incremental           Run fast incremental synchronization (default)

Examples:
  brain sync
  brain sync --full
`,
    retrieve: `
Usage: brain retrieve [options]

Retrieve minimal relevant context matching a query/prompt.

Options:
  --query <string>        The query to match against workspace context (required)
  --provider <id>         Filter target provider capabilities
  --budget <tokens>       Estimated context token budget (default: 8000)

Examples:
  brain retrieve --query "database connection pool setup"
  brain retrieve --query "auth handlers" --budget 4000
`,
    query: `
Usage: brain query [options]

Run Query Engine to inspect and query the semantic snapshot graph.

Options:
  --query <string>        Semantic query to execute (required)
  --format <json|text>    Force specific output format

Examples:
  brain query --query "find all files importing db.ts"
  brain query --query "list public classes" --format json
`,
    workflow: `
Usage: brain workflow <subcommand> [options]

Manage and coordinate end-to-end engineering workflows.

Subcommands:
  run --issue <desc>      Start a new autonomous workflow for an issue
  resume --workflow-id <id> Resume a suspended/checkpointed workflow
  cancel --workflow-id <id> Cancel a running workflow
  status --workflow-id <id> View execution status of a workflow
  history                 Show recent workflow executions
  report --workflow-id <id> Generate detailed workflow summary report
  diagnostics --workflow-id <id> Run troubleshooting diagnostics on a workflow

Examples:
  brain workflow run --issue "Implement logout endpoint"
  brain workflow status --workflow-id wf-12345
  brain workflow report --workflow-id wf-12345
`,
    runtime: `
Usage: brain runtime <subcommand> [options]

Execute and control tasks in the autonomous runtime layer.

Subcommands:
  execute --plan <path>   Execute an engineering plan JSON file
  resume                  Resume execution from latest checkpoint
  status                  Check current runtime state

Examples:
  brain runtime execute --plan plan.json
  brain runtime status
`,
    "shared-memory": `
Usage: brain shared-memory <subcommand> [options]

Inspect and manage the collaborative shared-memory layer.

Subcommands:
  status                  Show active agents, tasks, and phase
  agents                  List registered collaborative agents
  tasks                   List tasks tracked in shared memory
  conflicts               Show any detected branch/agent conflicts
  consensus               Show active consensus proposals and votes
  snapshot [--snapshot-id <id>] Save a shared-memory state snapshot
  restore --snapshot-id <id> Restore shared-memory state from snapshot
  statistics              Show collaborative engine metrics
  diagnostics             Print collaboration topology and utilization

Examples:
  brain shared-memory status
  brain shared-memory conflicts
  brain shared-memory snapshot --snapshot-id snap-v1
`,
    context: `
Usage: brain context <subcommand> [options]

Manage compiled semantic snapshots.

Subcommands:
  latest                  Print metadata of the latest snapshot
  list                    List available snapshots in the workspace
  validate                Run validation checks on the latest snapshot
  compact                 Clean up old snapshots keeping recent 5
  rollback --to <id>      Rollback to a specific snapshot ID
  delta --from <id> --to <id> Print differences between two snapshots

Examples:
  brain context list
  brain context validate
  brain context delta --from snap-1 --to snap-2
`,
    workspace: `
Usage: brain workspace <subcommand> [options]

Inspect and manage workspace file transactions and state.

Subcommands:
  status                  Show staged changes and locks
  transactions            List staged transactional operations
  locks                   List active file locks
  journal                 Print file mutation transaction log
  rollback --tx <id>      Rollback a staged workspace transaction

Examples:
  brain workspace status
  brain workspace rollback --tx tx-12345
`,
    learning: `
Usage: brain learning <subcommand> [options]

Interact with the repository learning engine.

Subcommands:
  learn --event <path>    Feed a loop outcome JSON file to the learning engine
  recommend --query <str> Query recommendations for a task
  statistics              Show learning database metrics

Examples:
  brain learning recommend --query "refactor parser"
  brain learning statistics
`,
    provider: `
Usage: brain provider <subcommand> [options]

Inspect and monitor capability providers (LLM and tools).

Subcommands:
  list                    List registered providers
  health                  Run live health/latency checks on providers
  benchmark               Benchmark registered providers

Examples:
  brain provider list
  brain provider health
`,
    doctor: `
Usage: brain doctor

Run global workspace integrity diagnostics.

Examples:
  brain doctor
  brain doctor --verbose
`,
    clean: `
Usage: brain clean [options]

Remove cache files, transaction logs, and old snapshots.

Options:
  --dry-run               Show files to be deleted without removing them

Examples:
  brain clean
  brain clean --dry-run
`,
    stats: `
Usage: brain stats [options]

Display aggregated repository and database metrics.

Examples:
  brain stats
  brain stats --json
`,
    config: `
Usage: brain config <subcommand> [options]

Configure workspace settings.

Subcommands:
  show                    Display current configuration JSON
  set --key <k> --value <v> Set a configuration value
  reset                   Reset configurations to defaults

Examples:
  brain config show
  brain config set --key compiler.incremental --value false
  brain config reset
`
};
// ── Main ──────────────────────────────────────────────────────────────────────
export async function main(argv = process.argv.slice(2)) {
    const parsed = parseArgs(argv);
    const { command, subcommand, flags, positionals } = parsed;
    // Apply global options immediately
    if (flag(flags, "no-color"))
        setColorEnabled(false);
    const json = flag(flags, "json");
    const verbose = flag(flags, "verbose");
    const quiet = flag(flags, "quiet");
    setJsonMode(json);
    setLogLevel(verbose ? "verbose" : quiet ? "quiet" : "normal");
    if (flag(flags, "version")) {
        if (json)
            process.stdout.write(JSON.stringify({ version: VERSION }) + "\n");
        else
            process.stdout.write(`brain ${VERSION}\n`);
        return;
    }
    if (command && flag(flags, "help")) {
        const cmdHelp = COMMAND_HELP[command];
        if (cmdHelp) {
            process.stdout.write(cmdHelp + "\n");
            return;
        }
    }
    if (!command || flag(flags, "help")) {
        process.stdout.write(HELP + "\n");
        return;
    }
    const workspace = resolveWorkspace(flagStr(flags, "workspace"));
    const project = resolveProject(flagStr(flags, "project"), workspace);
    const opts = { workspace, project, json, verbose, quiet };
    try {
        switch (command) {
            case "init": {
                const { runInit } = await import("./commands/init.js");
                await runInit(opts);
                break;
            }
            case "compile": {
                const { runCompile } = await import("./commands/compile.js");
                await runCompile(opts, {
                    force: flag(flags, "force"),
                    incremental: flag(flags, "incremental"),
                    watch: flag(flags, "watch"),
                });
                break;
            }
            case "sync": {
                const { runSync } = await import("./commands/sync.js");
                await runSync(opts, {
                    full: flag(flags, "full"),
                    incremental: flag(flags, "incremental"),
                });
                break;
            }
            case "retrieve": {
                const { runRetrieve } = await import("./commands/retrieve.js");
                await runRetrieve(opts, {
                    query: flagStr(flags, "query"),
                    provider: flagStr(flags, "provider"),
                    budget: flagNum(flags, "budget"),
                });
                break;
            }
            case "query": {
                const { runQuery } = await import("./commands/query.js");
                await runQuery(opts, {
                    query: flagStr(flags, "query"),
                    format: flagStr(flags, "format"),
                });
                break;
            }
            case "workflow": {
                if (!subcommand) {
                    process.stdout.write("Usage: brain workflow <run|resume|cancel|status|history|report|diagnostics> [options]\n");
                    process.exit(EXIT_VALIDATION);
                }
                const { runWorkflow } = await import("./commands/workflow.js");
                await runWorkflow(opts, subcommand, {
                    issue: flagStr(flags, "issue"),
                    workflowId: flagStr(flags, "workflow-id"),
                });
                break;
            }
            case "runtime": {
                if (!subcommand) {
                    process.stdout.write("Usage: brain runtime <execute|resume|status> [options]\n");
                    process.exit(EXIT_VALIDATION);
                }
                const { runRuntime } = await import("./commands/runtime.js");
                await runRuntime(opts, subcommand, {
                    plan: flagStr(flags, "plan"),
                });
                break;
            }
            case "shared-memory": {
                if (!subcommand) {
                    process.stdout.write("Usage: brain shared-memory <status|agents|tasks|conflicts|consensus|snapshot|restore|statistics|diagnostics>\n");
                    process.exit(EXIT_VALIDATION);
                }
                const { runSharedMemory } = await import("./commands/shared-memory.js");
                await runSharedMemory(opts, subcommand, {
                    "snapshot-id": flagStr(flags, "snapshot-id"),
                });
                break;
            }
            case "context": {
                if (!subcommand) {
                    process.stdout.write("Usage: brain context <latest|list|validate|compact|rollback|delta> [options]\n");
                    process.exit(EXIT_VALIDATION);
                }
                const { runContext } = await import("./commands/context.js");
                await runContext(opts, subcommand, {
                    to: flagStr(flags, "to"),
                    from: flagStr(flags, "from"),
                });
                break;
            }
            case "workspace": {
                if (!subcommand) {
                    process.stdout.write("Usage: brain workspace <status|transactions|locks|journal|rollback> [options]\n");
                    process.exit(EXIT_VALIDATION);
                }
                const { runWorkspaceCmd } = await import("./commands/workspace.js");
                await runWorkspaceCmd(opts, subcommand, {
                    tx: flagStr(flags, "tx"),
                });
                break;
            }
            case "learning": {
                if (!subcommand) {
                    process.stdout.write("Usage: brain learning <learn|recommend|statistics> [options]\n");
                    process.exit(EXIT_VALIDATION);
                }
                const { runLearning } = await import("./commands/learning.js");
                await runLearning(opts, subcommand, {
                    event: flagStr(flags, "event"),
                    query: flagStr(flags, "query"),
                });
                break;
            }
            case "provider": {
                if (!subcommand) {
                    process.stdout.write("Usage: brain provider <list|health|benchmark>\n");
                    process.exit(EXIT_VALIDATION);
                }
                const { runProvider } = await import("./commands/provider.js");
                await runProvider(opts, subcommand, {});
                break;
            }
            case "doctor": {
                const { runDoctor } = await import("./commands/doctor.js");
                await runDoctor(opts, subcommand);
                break;
            }
            case "clean": {
                const { runClean } = await import("./commands/clean.js");
                await runClean(opts, { dryRun: flag(flags, "dry-run") });
                break;
            }
            case "stats": {
                const { runStats } = await import("./commands/stats.js");
                await runStats(opts);
                break;
            }
            case "config": {
                if (!subcommand) {
                    process.stdout.write("Usage: brain config <show|set|reset> [--key <key>] [--value <value>]\n");
                    process.exit(EXIT_VALIDATION);
                }
                const { runConfig } = await import("./commands/config.js");
                await runConfig(opts, subcommand, {
                    key: flagStr(flags, "key"),
                    value: flagStr(flags, "value"),
                });
                break;
            }
            case "install": {
                const { runInstall } = await import("./commands/install.js");
                await runInstall(opts, {
                    dryRun: flag(flags, "dry-run"),
                    repair: flag(flags, "repair"),
                    uninstall: flag(flags, "uninstall"),
                    providerId: flagStr(flags, "provider"),
                    binDir: flagStr(flags, "bin-dir"),
                });
                break;
            }
            case "dispatch": {
                const { WrapperDispatcher } = await import("../ai-gateway/wrapper-dispatcher.js");
                const providerId = flagStr(flags, "provider") || "";
                const passThroughArgs = [];
                const doubleDashIdx = process.argv.indexOf("--");
                if (doubleDashIdx !== -1) {
                    passThroughArgs.push(...process.argv.slice(doubleDashIdx + 1));
                }
                const dispatcher = new WrapperDispatcher(providerId, passThroughArgs);
                await dispatcher.dispatch();
                break;
            }
            case "gateway": {
                if (!subcommand) {
                    process.stdout.write("Usage: brain gateway <run|status|history|metrics|session|diagnostics|integration> [options]\n");
                    process.exit(EXIT_VALIDATION);
                }
                const { runGateway } = await import("./commands/gateway.js");
                const passThroughArgs = [];
                // Gather any args after --
                const doubleDashIdx = process.argv.indexOf("--");
                if (doubleDashIdx !== -1) {
                    passThroughArgs.push(...process.argv.slice(doubleDashIdx + 1));
                }
                await runGateway(opts, subcommand, {
                    provider: flagStr(flags, "provider"),
                    limit: flagNum(flags, "limit"),
                    id: flagStr(flags, "id") ?? (positionals[2] || undefined),
                    args: passThroughArgs,
                });
                break;
            }
            case "explain": {
                const sessionId = positionals[1];
                const { runExplain } = await import("./commands/explain.js");
                await runExplain(opts, sessionId);
                break;
            }
            default: {
                process.stderr.write(`Unknown command: ${command}\nRun: brain --help\n`);
                process.exit(EXIT_VALIDATION);
            }
        }
    }
    catch (err) {
        handleError(err, json);
    }
}
// Run if invoked directly
const isMain = process.argv[1]?.endsWith("main.js") || process.argv[1]?.endsWith("main.ts");
if (isMain) {
    main().catch(err => handleError(err, false));
}
