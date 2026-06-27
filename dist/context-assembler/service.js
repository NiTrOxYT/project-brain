import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { FileSystemService } from "../filesystem/index.js";
import { PlannerService } from "../planner/index.js";
import { ContextBudgetService } from "../context-budget/index.js";
import { ContextAssemblerError } from "./errors.js";
export class ContextAssemblerService {
    projectRoot;
    workspaceRoot;
    filesystem = new FileSystemService();
    planner;
    budgeter;
    constructor(projectRoot, workspaceRoot) {
        this.projectRoot = projectRoot;
        this.workspaceRoot = workspaceRoot;
        this.planner = new PlannerService(workspaceRoot);
        this.budgeter = new ContextBudgetService();
    }
    async assemble(query, maxTokens, options) {
        try {
            const queryHashInput = (maxTokens || options?.includeExecution || options?.includeRelationships || options?.includeGraph || options?.includeArchitectureMemory)
                ? JSON.stringify({
                    query,
                    maxTokens: maxTokens || undefined,
                    includeExecution: options?.includeExecution || undefined,
                    includeRelationships: options?.includeRelationships || undefined,
                    includeGraph: options?.includeGraph || undefined,
                    includeArchitectureMemory: options?.includeArchitectureMemory || undefined
                })
                : query;
            const queryHash = crypto
                .createHash("sha256")
                .update(queryHashInput)
                .digest("hex");
            const cacheDir = path.join(this.workspaceRoot, "context");
            const cachePath = path.join(cacheDir, `${queryHash}.json`);
            const isCached = options?.bypassCache !== true && await this.filesystem.exists(cachePath);
            if (isCached) {
                const cached = await this.filesystem.readJson(cachePath);
                const symbolsPath = path.join(this.workspaceRoot, "index", "symbols.json");
                const indexPath = path.join(this.workspaceRoot, "index", "index.json");
                const relationshipsPath = path.join(this.workspaceRoot, "index", "relationships.json");
                const graphPath = path.join(this.workspaceRoot, "graph", "graph.json");
                const [symbolsStat, indexStat, relStat, graphStat] = await Promise.all([
                    fs.stat(symbolsPath).catch(() => null),
                    fs.stat(indexPath).catch(() => null),
                    fs.stat(relationshipsPath).catch(() => null),
                    fs.stat(graphPath).catch(() => null)
                ]);
                const cachedTime = new Date(cached.generatedAt).getTime();
                let isValid = true;
                if (symbolsStat && symbolsStat.mtime.getTime() > cachedTime)
                    isValid = false;
                if (indexStat && indexStat.mtime.getTime() > cachedTime)
                    isValid = false;
                if (relStat && relStat.mtime.getTime() > cachedTime)
                    isValid = false;
                if (graphStat && graphStat.mtime.getTime() > cachedTime)
                    isValid = false;
                if (isValid) {
                    return cached;
                }
            }
            // Cache invalid or missing. Run pipeline.
            const plan = await this.planner.plan(query);
            // Get fused candidates, falling back to internal fusion if not provided
            let fusedCandidates = options?.fusedCandidates;
            if (!fusedCandidates) {
                const { KnowledgeFusionService } = await import("../knowledge-fusion/index.js");
                const fusionService = new KnowledgeFusionService(this.workspaceRoot);
                const fusionResult = await fusionService.fuse({
                    query,
                    options: {
                        includeExecution: options?.includeExecution,
                        includeRelationships: options?.includeRelationships,
                        includeGraph: options?.includeGraph,
                        includeArchitectureMemory: options?.includeArchitectureMemory
                    }
                });
                fusedCandidates = fusionResult.candidates;
            }
            const symbolsData = await this.filesystem.readJson(path.join(this.workspaceRoot, "index", "symbols.json"));
            // Separate and map candidates for the budgeter
            const budgetCandidates = [];
            const memoryEntriesList = [];
            for (const cand of fusedCandidates) {
                if (cand.type === "file") {
                    let content = "";
                    try {
                        content = await fs.readFile(path.join(this.projectRoot, cand.id), "utf8");
                    }
                    catch {
                        // ignore
                    }
                    const estimatedTokens = Math.ceil(content.length / 4);
                    const symbolCount = symbolsData.symbols.filter(s => s.file === cand.id).length;
                    budgetCandidates.push({
                        path: cand.id,
                        score: cand.score * 1000,
                        estimatedTokens,
                        symbols: symbolCount
                    });
                }
                else if (cand.type === "memory") {
                    const entry = cand.metadata.entry;
                    if (entry) {
                        const estimatedTokens = Math.ceil(JSON.stringify(entry).length / 4);
                        budgetCandidates.push({
                            path: cand.id,
                            score: cand.score * 1000,
                            estimatedTokens,
                            symbols: 0
                        });
                        memoryEntriesList.push(entry);
                    }
                }
            }
            // Respect Context Budget
            const budgetResult = this.budgeter.budget({
                candidates: budgetCandidates,
                maxTokens: maxTokens ?? plan.contextBudget * 1000
            });
            const selectedFilesCandidate = budgetResult.files.filter(f => !f.path.startsWith("memory#"));
            const selectedMemoryCandidates = budgetResult.files.filter(f => f.path.startsWith("memory#"));
            const selectedFiles = selectedFilesCandidate;
            const selectedFilesSet = new Set(selectedFiles.map(f => f.path));
            // Resolve actual memory entries selected by budgeter
            const selectedMemoryEntriesList = [];
            for (const cand of selectedMemoryCandidates) {
                const entryId = cand.path.replace("memory#", "");
                const entry = memoryEntriesList.find(e => e.id === entryId);
                if (entry) {
                    selectedMemoryEntriesList.push(entry);
                }
            }
            // Merge and filter symbols
            const filteredSymbols = [];
            const seenSymbols = new Set();
            for (const sym of symbolsData.symbols) {
                if (selectedFilesSet.has(sym.file)) {
                    const key = `${sym.file}:${sym.name}:${sym.kind}`;
                    if (!seenSymbols.has(key)) {
                        seenSymbols.add(key);
                        filteredSymbols.push({
                            name: sym.name,
                            kind: sym.kind,
                            file: sym.file,
                            line: sym.line
                        });
                    }
                }
            }
            // Merge and filter relationships
            const relationshipsPath = path.join(this.workspaceRoot, "index", "relationships.json");
            const filteredRelationships = [];
            const seenRels = new Set();
            if (options?.includeRelationships !== false && await this.filesystem.exists(relationshipsPath)) {
                const relData = await this.filesystem.readJson(relationshipsPath);
                for (const rel of relData.relationships) {
                    if (selectedFilesSet.has(rel.file)) {
                        const key = `${rel.file}:${rel.source}:${rel.target}:${rel.type}`;
                        if (!seenRels.has(key)) {
                            seenRels.add(key);
                            filteredRelationships.push({
                                source: rel.source,
                                target: rel.target,
                                type: rel.type,
                                file: rel.file,
                                line: rel.line
                            });
                        }
                    }
                }
            }
            // Merge and filter graph
            const graphPath = path.join(this.workspaceRoot, "graph", "graph.json");
            let filteredGraph = { nodes: [], edges: [] };
            if (options?.includeGraph !== false && await this.filesystem.exists(graphPath)) {
                const graphData = await this.filesystem.readJson(graphPath);
                filteredGraph = {
                    nodes: graphData.nodes
                        .filter(n => selectedFilesSet.has(n.id))
                        .map(n => ({ id: n.id, type: n.type })),
                    edges: graphData.edges
                        .filter(e => selectedFilesSet.has(e.from) && selectedFilesSet.has(e.to))
                        .map(e => ({ from: e.from, to: e.to, type: e.type }))
                };
            }
            // Merge and filter execution graph
            const execPath = path.join(this.workspaceRoot, "index", "execution-graph.json");
            let filteredExecutionGraph;
            if (options?.includeExecution === true && await this.filesystem.exists(execPath)) {
                const execData = await this.filesystem.readJson(execPath);
                filteredExecutionGraph = {
                    nodes: execData.nodes
                        .filter(n => selectedFilesSet.has(n.file))
                        .map(n => ({ id: n.id, type: n.kind })),
                    edges: execData.edges
                        .filter(e => {
                        const fromFile = e.from.split("#")[0];
                        const toFile = e.to.split("#")[0];
                        return selectedFilesSet.has(fromFile) && selectedFilesSet.has(toFile);
                    })
                        .map(e => ({ from: e.from, to: e.to, type: e.type }))
                };
            }
            // Load evolution analytics for metadata enrichment
            const evolutionPath = path.join(this.workspaceRoot, "index", "evolution", "analytics.json");
            const evolutionExists = await this.filesystem.exists(evolutionPath);
            const evolutionAnalytics = evolutionExists
                ? await this.filesystem.readJson(evolutionPath)
                : { fileHistory: [] };
            const contextPackage = {
                generatedAt: new Date().toISOString(),
                query,
                plan,
                files: selectedFiles.map(f => {
                    const record = evolutionAnalytics.fileHistory.find(h => h.path === f.path);
                    return {
                        path: f.path,
                        score: f.score,
                        estimatedTokens: f.estimatedTokens,
                        lastModified: record?.lastModification,
                        commitCount: record?.commitCount,
                        churnScore: record?.churnScore,
                        primaryOwner: record?.primaryOwner
                    };
                }),
                symbols: filteredSymbols,
                relationships: filteredRelationships,
                graph: filteredGraph,
                executionGraph: filteredExecutionGraph,
                architectureMemory: selectedMemoryEntriesList.length > 0 ? selectedMemoryEntriesList : undefined,
                engineeringPlan: options?.engineeringPlan,
                executionSchedule: options?.executionSchedule,
                executionDiagnostics: options?.executionDiagnostics,
                estimatedTokens: budgetResult.usedTokens
            };
            // Write to cache
            if (!(await this.filesystem.exists(cacheDir))) {
                await this.filesystem.mkdir(cacheDir);
            }
            await this.filesystem.writeJson(cachePath, contextPackage);
            return contextPackage;
        }
        catch (error) {
            if (error instanceof ContextAssemblerError) {
                throw error;
            }
            throw new ContextAssemblerError(`Failed to assemble context: ${error.message}`);
        }
    }
}
