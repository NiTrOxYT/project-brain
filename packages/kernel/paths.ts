import os from "os";
import path from "path";

export class GlobalPaths {
    /** ~/.project-brain */
    readonly root: string;

    /** ~/.project-brain/bin — PATH-precedence wrappers (named after providers) */
    readonly binDir: string;

    /** ~/.project-brain/wrappers — wrapper script sources */
    readonly wrappersDir: string;

    /** ~/.project-brain/providers — one JSON file per registered provider */
    readonly providersDir: string;

    /** ~/.project-brain/sessions — JSONL session records */
    readonly sessionsDir: string;

    /** ~/.project-brain/metrics — aggregate stats */
    readonly metricsDir: string;

    /** ~/.project-brain/metrics/aggregate.json */
    readonly aggregateMetricsPath: string;

    /** ~/.project-brain/logs — rotating JSONL logs */
    readonly logsDir: string;

    /** ~/.project-brain/cache — shared optimizer/retrieval cache */
    readonly cacheDir: string;

    /** ~/.project-brain/plugins — future plugin descriptors */
    readonly pluginsDir: string;

    /** ~/.project-brain/config.json — global runtime configuration */
    readonly configPath: string;

    constructor(overrideRoot?: string) {
        this.root            = overrideRoot ?? process.env.PROJECT_BRAIN_ROOT ?? path.join(os.homedir(), ".project-brain");
        this.binDir          = path.join(this.root, "bin");
        this.wrappersDir     = path.join(this.root, "wrappers");
        this.providersDir    = path.join(this.root, "providers");
        this.sessionsDir     = path.join(this.root, "sessions");
        this.metricsDir      = path.join(this.root, "metrics");
        this.aggregateMetricsPath = path.join(this.metricsDir, "aggregate.json");
        this.logsDir         = path.join(this.root, "logs");
        this.cacheDir        = path.join(this.root, "cache");
        this.pluginsDir      = path.join(this.root, "plugins");
        this.configPath      = path.join(this.root, "config.json");
    }

    /** All directories that must exist for the runtime to function. */
    allDirs(): string[] {
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
    sessionFile(date: Date = new Date()): string {
        const iso = date.toISOString().slice(0, 10); // "YYYY-MM-DD"
        return path.join(this.sessionsDir, `${iso}.jsonl`);
    }

    /**
     * Returns the path for a provider registration JSON file.
     * Format: ~/.project-brain/providers/<id>.json
     */
    providerFile(id: string): string {
        return path.join(this.providersDir, `${id}.json`);
    }

    /**
     * Returns the path for a generated wrapper script.
     * Format: ~/.project-brain/wrappers/<id>  (no extension on POSIX)
     *         ~/.project-brain/wrappers/<id>.cmd  (Windows)
     */
    wrapperScript(id: string, platform: NodeJS.Platform = process.platform): string {
        const ext = platform === "win32" ? ".cmd" : "";
        return path.join(this.wrappersDir, `${id}${ext}`);
    }

    /**
     * Returns the path for the symlink/copy in bin/.
     * Format: ~/.project-brain/bin/<id>  (or <id>.cmd on Windows)
     */
    binEntry(id: string, platform: NodeJS.Platform = process.platform): string {
        const ext = platform === "win32" ? ".cmd" : "";
        return path.join(this.binDir, `${id}${ext}`);
    }

    /**
     * Returns true if the given absolute path is inside binDir.
     * Used by the installer loop guard.
     */
    isInsideBin(absolutePath: string): boolean {
        const normalized = path.normalize(absolutePath);
        const bin        = path.normalize(this.binDir) + path.sep;
        return normalized.startsWith(bin) || normalized === path.normalize(this.binDir);
    }

    /**
     * Returns true if binDir is present in the current PATH.
     */
    isBinInPath(env: NodeJS.ProcessEnv = process.env): boolean {
        const pathEnv = env.PATH ?? env.Path ?? "";
        const entries = pathEnv.split(path.delimiter);
        const bin     = path.normalize(this.binDir);
        return entries.some(e => path.normalize(e) === bin);
    }
}

export class StoragePaths {
    readonly brainDir: string;
    readonly configPath: string;
    readonly snapshotsDir: string;
    readonly indexPath: string;
    readonly patchesDir: string;
    readonly lineagePath: string;
    readonly compilerCacheDir: string;
    readonly retrievalCacheDir: string;
    readonly compilerMetricsPath: string;
    readonly syncMetricsPath: string;
    readonly retrievalMetricsPath: string;
    readonly journalDir: string;
    readonly workspaceJournalPath: string;
    readonly checkpointsDir: string;
    readonly learningDir: string;
    readonly sharedMemoryDir: string;
    readonly locksDir: string;
    readonly workflowsDir: string;

    constructor(readonly workspaceRoot: string) {
        this.brainDir = workspaceRoot.endsWith(".brain") ? workspaceRoot : path.join(workspaceRoot, ".brain");
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
