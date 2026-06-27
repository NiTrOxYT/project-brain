import fs from "fs/promises";
import path from "path";
export class PromptContextBuilder {
    workspaceRoot;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    lastContext;
    lastSnapshotId;
    async collect(task, runtimeContext, snapshot) {
        // Fast path: consume snapshot sections directly if available
        if (snapshot) {
            if (this.lastContext && this.lastSnapshotId === snapshot.snapshotId) {
                return this.lastContext;
            }
            if (this.lastContext && snapshot.metadata.incremental && snapshot.metadata.parentSnapshotId === this.lastSnapshotId) {
                // Read only updated sections and patch the last context
                const updated = this.collectFromSnapshot(task, runtimeContext, snapshot);
                this.lastContext = {
                    ...this.lastContext,
                    ...updated,
                    workspaceMetadata: {
                        ...this.lastContext.workspaceMetadata,
                        ...updated.workspaceMetadata
                    }
                };
                this.lastSnapshotId = snapshot.snapshotId;
                return this.lastContext;
            }
            const context = this.collectFromSnapshot(task, runtimeContext, snapshot);
            this.lastContext = context;
            this.lastSnapshotId = snapshot.snapshotId;
            return context;
        }
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
    collectFromSnapshot(task, runtimeContext, snapshot) {
        // Extract architecture memory from snapshot
        const archSection = snapshot.sections.find(s => s.id === "architecture-memory");
        const architectureMemory = archSection
            ? { entries: snapshot.architecture }
            : { entries: [] };
        // Extract evolution data
        const evoSection = snapshot.sections.find(s => s.id === "repository-evolution");
        const repositoryEvolution = evoSection
            ? { fileHistory: snapshot.evolution }
            : { fileHistory: [], coChangeRelationships: [] };
        // Extract learning data
        const learnSection = snapshot.sections.find(s => s.id === "learning-summary");
        const learningEngine = learnSection
            ? { experiences: snapshot.learning, optimizations: [] }
            : { experiences: [], optimizations: [] };
        // Extract graph data
        const graphSection = snapshot.sections.find(s => s.id === "execution-graph");
        const executionGraph = graphSection
            ? { nodes: snapshot.graph.nodes, edges: snapshot.graph.edges }
            : { nodes: [], edges: [] };
        // Extract relationships
        const relSection = snapshot.sections.find(s => s.id === "knowledge-graph");
        const relationshipGraph = relSection ? JSON.parse(relSection.content) : {};
        // Build fused candidates from file index
        const knowledgeFusion = snapshot.files.map(f => ({
            path: f.path,
            score: 1.0
        }));
        const workspaceMetadata = {
            workspaceRoot: this.workspaceRoot,
            os: process.platform,
            nodeVersion: process.version,
            snapshotId: snapshot.snapshotId,
            snapshotVersion: snapshot.metadata.fingerprint.version
        };
        const executionHistory = snapshot.learning;
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
