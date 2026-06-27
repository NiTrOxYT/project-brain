import os from "os";
import path from "path";
export class GlobalPaths {
    /** ~/.project-brain */
    root;
    /** ~/.project-brain/bin — PATH-precedence wrappers (named after providers) */
    binDir;
    /** ~/.project-brain/wrappers — wrapper script sources */
    wrappersDir;
    /** ~/.project-brain/providers — one JSON file per registered provider */
    providersDir;
    /** ~/.project-brain/sessions — JSONL session records */
    sessionsDir;
    /** ~/.project-brain/metrics — aggregate stats */
    metricsDir;
    /** ~/.project-brain/metrics/aggregate.json */
    aggregateMetricsPath;
    /** ~/.project-brain/logs — rotating JSONL logs */
    logsDir;
    /** ~/.project-brain/cache — shared optimizer/retrieval cache */
    cacheDir;
    /** ~/.project-brain/plugins — future plugin descriptors */
    pluginsDir;
    /** ~/.project-brain/config.json — global runtime configuration */
    configPath;
    constructor(overrideRoot) {
        this.root = overrideRoot ?? process.env.PROJECT_BRAIN_ROOT ?? path.join(os.homedir(), ".project-brain");
        this.binDir = path.join(this.root, "bin");
        this.wrappersDir = path.join(this.root, "wrappers");
        this.providersDir = path.join(this.root, "providers");
        this.sessionsDir = path.join(this.root, "sessions");
        this.metricsDir = path.join(this.root, "metrics");
        this.aggregateMetricsPath = path.join(this.metricsDir, "aggregate.json");
        this.logsDir = path.join(this.root, "logs");
        this.cacheDir = path.join(this.root, "cache");
        this.pluginsDir = path.join(this.root, "plugins");
        this.configPath = path.join(this.root, "config.json");
    }
    /** All directories that must exist for the runtime to function. */
    allDirs() {
        return [
            this.root,
            this.binDir,
            this.wrappersDir,
            this.providersDir,
            this.sessionsDir,
            this.metricsDir,
            this.logsDir,
            this.cacheDir,
            this.pluginsDir,
        ];
    }
    /**
     * Returns the path for a session JSONL file for a given date.
     * Format: ~/.project-brain/sessions/YYYY-MM-DD.jsonl
     */
    sessionFile(date = new Date()) {
        const iso = date.toISOString().slice(0, 10); // "YYYY-MM-DD"
        return path.join(this.sessionsDir, `${iso}.jsonl`);
    }
    /**
     * Returns the path for a provider registration JSON file.
     * Format: ~/.project-brain/providers/<id>.json
     */
    providerFile(id) {
        return path.join(this.providersDir, `${id}.json`);
    }
    /**
     * Returns the path for a generated wrapper script.
     * Format: ~/.project-brain/wrappers/<id>  (no extension on POSIX)
     *         ~/.project-brain/wrappers/<id>.cmd  (Windows)
     */
    wrapperScript(id, platform = process.platform) {
        const ext = platform === "win32" ? ".cmd" : "";
        return path.join(this.wrappersDir, `${id}${ext}`);
    }
    /**
     * Returns the path for the symlink/copy in bin/.
     * Format: ~/.project-brain/bin/<id>  (or <id>.cmd on Windows)
     */
    binEntry(id, platform = process.platform) {
        const ext = platform === "win32" ? ".cmd" : "";
        return path.join(this.binDir, `${id}${ext}`);
    }
    /**
     * Returns true if the given absolute path is inside binDir.
     * Used by the installer loop guard.
     */
    isInsideBin(absolutePath) {
        const normalized = path.normalize(absolutePath);
        const bin = path.normalize(this.binDir) + path.sep;
        return normalized.startsWith(bin) || normalized === path.normalize(this.binDir);
    }
    /**
     * Returns true if binDir is present in the current PATH.
     */
    isBinInPath(env = process.env) {
        const pathEnv = env.PATH ?? env.Path ?? "";
        const entries = pathEnv.split(path.delimiter);
        const bin = path.normalize(this.binDir);
        return entries.some(e => path.normalize(e) === bin);
    }
}
export class StoragePaths {
    workspaceRoot;
    brainDir;
    configPath;
    snapshotsDir;
    indexPath;
    patchesDir;
    lineagePath;
    compilerCacheDir;
    retrievalCacheDir;
    compilerMetricsPath;
    syncMetricsPath;
    retrievalMetricsPath;
    journalDir;
    workspaceJournalPath;
    checkpointsDir;
    learningDir;
    sharedMemoryDir;
    locksDir;
    workflowsDir;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.brainDir = path.join(workspaceRoot, ".brain");
        this.configPath = path.join(this.brainDir, "brain.json");
        this.snapshotsDir = path.join(this.brainDir, "snapshots");
        this.indexPath = path.join(this.snapshotsDir, "index.json");
        this.patchesDir = path.join(this.brainDir, "patches");
        this.lineagePath = path.join(this.brainDir, "journal", "lineage.jsonl");
        this.compilerCacheDir = path.join(this.brainDir, "cache");
        this.retrievalCacheDir = path.join(this.brainDir, "retrieval-cache");
        this.compilerMetricsPath = path.join(this.compilerCacheDir, "compiler-metrics.json");
        this.syncMetricsPath = path.join(this.compilerCacheDir, "sync-metrics.json");
        this.retrievalMetricsPath = path.join(this.compilerCacheDir, "retrieval-metrics.json");
        this.journalDir = path.join(this.brainDir, "journal");
        this.workspaceJournalPath = path.join(this.journalDir, "workspace.jsonl");
        this.checkpointsDir = path.join(this.brainDir, "checkpoints");
        this.learningDir = path.join(this.brainDir, "learning");
        this.sharedMemoryDir = path.join(this.brainDir, "shared-memory");
        this.locksDir = path.join(this.brainDir, "locks");
        this.workflowsDir = path.join(this.brainDir, "workflows");
    }
}
