import fs from "fs/promises";
import path from "path";
export class PromptContextBuilder {
    workspaceRoot;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    async collect(task, runtimeContext) {
        let knowledgeFusion = null;
        if (runtimeContext.fusedCandidates) {
            knowledgeFusion = runtimeContext.fusedCandidates;
        }
        let architectureMemory = null;
        try {
            const archPath = path.join(this.workspaceRoot, "memory", "architecture.json");
            const raw = await fs.readFile(archPath, "utf8");
            architectureMemory = JSON.parse(raw);
        }
        catch {
            // Check for other files in memory directory
            try {
                const memoryDir = path.join(this.workspaceRoot, "memory");
                const files = await fs.readdir(memoryDir);
                const entries = [];
                for (const file of files) {
                    if (file.endsWith(".json") && file !== "metadata.json") {
                        const raw = await fs.readFile(path.join(memoryDir, file), "utf8");
                        const parsed = JSON.parse(raw);
                        if (parsed.entries) {
                            entries.push(...parsed.entries);
                        }
                        else if (Array.isArray(parsed)) {
                            entries.push(...parsed);
                        }
                    }
                }
                architectureMemory = { entries };
            }
            catch {
                architectureMemory = { entries: [] };
            }
        }
        let repositoryEvolution = null;
        try {
            const evoPath = path.join(this.workspaceRoot, "index", "evolution", "analytics.json");
            const raw = await fs.readFile(evoPath, "utf8");
            repositoryEvolution = JSON.parse(raw);
        }
        catch {
            repositoryEvolution = { fileHistory: [], coChangeRelationships: [] };
        }
        let learningEngine = null;
        try {
            const learningDir = path.join(this.workspaceRoot, "learning");
            const expsRaw = await fs.readFile(path.join(learningDir, "experience.json"), "utf8").catch(() => "[]");
            const optsRaw = await fs.readFile(path.join(learningDir, "optimizations.json"), "utf8").catch(() => "[]");
            learningEngine = {
                experiences: JSON.parse(expsRaw),
                optimizations: JSON.parse(optsRaw)
            };
        }
        catch {
            learningEngine = { experiences: [], optimizations: [] };
        }
        let executionGraph = null;
        try {
            const graphPath = path.join(this.workspaceRoot, "graph", "graph.json");
            const raw = await fs.readFile(graphPath, "utf8");
            executionGraph = JSON.parse(raw);
        }
        catch {
            executionGraph = { nodes: [], edges: [] };
        }
        let relationshipGraph = null;
        try {
            const relPath = path.join(this.workspaceRoot, "index", "relationships.json");
            const raw = await fs.readFile(relPath, "utf8");
            relationshipGraph = JSON.parse(raw);
        }
        catch {
            relationshipGraph = {};
        }
        const workspaceMetadata = {
            workspaceRoot: this.workspaceRoot,
            os: process.platform,
            nodeVersion: process.version
        };
        const executionHistory = learningEngine?.experiences || [];
        return {
            task,
            runtimeContext,
            knowledgeFusion,
            architectureMemory,
            repositoryEvolution,
            learningEngine,
            workspaceMetadata,
            executionGraph,
            relationshipGraph,
            executionHistory
        };
    }
}
