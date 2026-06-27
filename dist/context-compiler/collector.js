// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Collector
// Gathers raw repository data from disk (index, graph, architecture, evolution,
// learning) and builds a SnapshotContext without any AI calls.
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs/promises";
import path from "path";
export class SnapshotCollector {
    projectRoot;
    workspaceRoot;
    constructor(projectRoot, workspaceRoot) {
        this.projectRoot = projectRoot;
        this.workspaceRoot = workspaceRoot;
    }
    async collect() {
        const [indexData, symbolsData, relationshipsData, graphData, architectureData, evolutionData, learningData, filePaths] = await Promise.all([
            this.loadJsonSafe(path.join(this.workspaceRoot, "index", "index.json")),
            this.loadJsonSafe(path.join(this.workspaceRoot, "index", "symbols.json")),
            this.loadJsonSafe(path.join(this.workspaceRoot, "index", "relationships.json")),
            this.loadJsonSafe(path.join(this.workspaceRoot, "graph", "graph.json")),
            this.loadArchitecture(),
            this.loadEvolution(),
            this.loadLearning(),
            this.collectFilePaths()
        ]);
        return {
            projectRoot: this.projectRoot,
            workspaceRoot: this.workspaceRoot,
            indexData,
            symbolsData,
            relationshipsData,
            graphData,
            architectureData,
            evolutionData,
            learningData,
            filePaths
        };
    }
    // ─── Loaders ─────────────────────────────────────────────────────────────
    async loadArchitecture() {
        // Try primary path first
        const primary = path.join(this.workspaceRoot, "memory", "architecture.json");
        try {
            const raw = await fs.readFile(primary, "utf8");
            return JSON.parse(raw);
        }
        catch {
            // Scan memory directory for any JSON files
            try {
                const memDir = path.join(this.workspaceRoot, "memory");
                const files = await fs.readdir(memDir);
                const entries = [];
                for (const file of files) {
                    if (!file.endsWith(".json") || file === "metadata.json")
                        continue;
                    try {
                        const raw = await fs.readFile(path.join(memDir, file), "utf8");
                        const parsed = JSON.parse(raw);
                        if (parsed.entries) {
                            entries.push(...parsed.entries);
                        }
                        else if (Array.isArray(parsed)) {
                            entries.push(...parsed);
                        }
                    }
                    catch {
                        // skip individual file failures
                    }
                }
                return { entries };
            }
            catch {
                return { entries: [] };
            }
        }
    }
    async loadEvolution() {
        const evoPath = path.join(this.workspaceRoot, "index", "evolution", "analytics.json");
        const data = await this.loadJsonSafe(evoPath);
        return data ?? { fileHistory: [], coChangeRelationships: [] };
    }
    async loadLearning() {
        const learningDir = path.join(this.workspaceRoot, "learning");
        const [experiences, optimizations] = await Promise.all([
            this.loadJsonSafe(path.join(learningDir, "experience.json")),
            this.loadJsonSafe(path.join(learningDir, "optimizations.json"))
        ]);
        return {
            experiences: experiences ?? [],
            optimizations: optimizations ?? []
        };
    }
    /**
     * Collect all file paths tracked by the workspace index (if available).
     * Falls back to walking the project root.
     */
    async collectFilePaths() {
        // Try reading from the index first (fast path)
        try {
            const raw = await fs.readFile(path.join(this.workspaceRoot, "index", "index.json"), "utf8");
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                // Array format: each element is a file entry with a path
                const paths = parsed
                    .map((e) => e.path || e.filePath || e)
                    .filter((p) => typeof p === "string");
                if (paths.length > 0)
                    return paths.sort();
            }
            else if (parsed && typeof parsed === "object") {
                // Object format: keys might be paths, or there's a "files" array
                if (Array.isArray(parsed.files)) {
                    const paths = parsed.files
                        .map((e) => e.path || e.filePath || e)
                        .filter((p) => typeof p === "string");
                    if (paths.length > 0)
                        return paths.sort();
                }
            }
        }
        catch {
            // fall through to filesystem walk
        }
        // Filesystem walk of projectRoot
        try {
            return (await this.walk(this.projectRoot)).sort();
        }
        catch {
            return [];
        }
    }
    async walk(dir, depth = 0) {
        if (depth > 8)
            return [];
        const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
        const paths = [];
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            // Skip common noise directories
            if (entry.name === "node_modules" ||
                entry.name === ".git" ||
                entry.name === ".brain" ||
                entry.name === "dist" ||
                entry.name === "build" ||
                entry.name === ".cache") {
                continue;
            }
            if (entry.isDirectory()) {
                const sub = await this.walk(fullPath, depth + 1);
                paths.push(...sub);
            }
            else if (entry.isFile()) {
                paths.push(fullPath);
            }
        }
        return paths;
    }
    async loadJsonSafe(filePath) {
        try {
            const raw = await fs.readFile(filePath, "utf8");
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
}
