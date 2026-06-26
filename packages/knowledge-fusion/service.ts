import path from "path";

import { FileSystemService } from "../filesystem";
import { PlannerService } from "../planner";
import { RetrieverService } from "../retriever";
import { ArchitectureMemoryService } from "../architecture-memory";
import { WeightedFusionStrategy } from "./strategies";
import { KnowledgeFusionError } from "./errors";
import {
    FusionRequest,
    FusionResult,
    FusionStrategy,
    KnowledgeCandidate,
    CandidateSignals,
    FusionDiagnostics
} from "./types";

export class KnowledgeFusionService {

    private readonly filesystem = new FileSystemService();

    constructor(
        private readonly workspaceRoot: string,
        private readonly strategy: FusionStrategy = new WeightedFusionStrategy()
    ) {}

    async fuse(request: FusionRequest): Promise<FusionResult> {

        try {

            const query = request.query;
            const options = request.options;

            // 1. Run retrieval / planning if not pre-provided
            const semanticRaw = new Map<string, number>();
            if (request.semanticCandidates) {
                for (const c of request.semanticCandidates) {
                    semanticRaw.set(c.path, c.score);
                }
            } else {
                const planner = new PlannerService(this.workspaceRoot);
                const plan = await planner.plan(query);
                const keywords = plan.keywords.length > 0 ? plan.keywords.join(" ") : query;

                const retriever = new RetrieverService(this.workspaceRoot);
                const retrieval = await retriever.retrieve({
                    query: keywords,
                    limit: 20
                });
                for (const file of retrieval.files) {
                    semanticRaw.set(file.path, file.score);
                }
            }

            // 2. Load indexes with fallback
            const graphPath = path.join(this.workspaceRoot, "graph", "graph.json");
            const execPath = path.join(this.workspaceRoot, "index", "execution-graph.json");
            const relPath = path.join(this.workspaceRoot, "index", "relationships.json");
            const evolutionPath = path.join(this.workspaceRoot, "index", "evolution", "analytics.json");

            const [graphExists, execExists, relExists, evolutionExists] = await Promise.all([
                this.filesystem.exists(graphPath),
                this.filesystem.exists(execPath),
                this.filesystem.exists(relPath),
                this.filesystem.exists(evolutionPath)
            ]);

            const graph = graphExists
                ? await this.filesystem.readJson<{ nodes: any[]; edges: any[] }>(graphPath)
                : { nodes: [], edges: [] };

            const execGraph = execExists
                ? await this.filesystem.readJson<{ nodes: any[]; edges: any[] }>(execPath)
                : { nodes: [], edges: [] };

            const relData = relExists
                ? await this.filesystem.readJson<{ relationships: any[] }>(relPath)
                : { relationships: [] };

            const evolutionAnalytics = evolutionExists
                ? await this.filesystem.readJson<{ fileHistory: any[]; coChangeRelationships: any[] }>(evolutionPath)
                : { fileHistory: [], coChangeRelationships: [] };

            // 3. Process Signals
            const semanticSignals = this.normalizeScores(semanticRaw);

            // Graph Proximity Signal
            const graphRaw = new Map<string, number>();
            if (options?.includeGraph !== false) {
                for (const [semPath, semScore] of semanticSignals.entries()) {
                    for (const edge of graph.edges) {
                        if (edge.from === semPath) {
                            graphRaw.set(edge.to, (graphRaw.get(edge.to) ?? 0) + semScore);
                        }
                        if (edge.to === semPath) {
                            graphRaw.set(edge.from, (graphRaw.get(edge.from) ?? 0) + semScore);
                        }
                    }
                }
            }
            const graphSignals = this.normalizeScores(graphRaw);

            // Execution Proximity Signal
            const execRaw = new Map<string, number>();
            const execFileRaw = new Map<string, number>();
            if (options?.includeExecution === true) {
                // Find target execution nodes in semantic files
                for (const node of execGraph.nodes) {
                    const semScore = semanticSignals.get(node.file);
                    if (semScore !== undefined) {
                        for (const edge of execGraph.edges) {
                            if (edge.from === node.id) {
                                execRaw.set(edge.to, (execRaw.get(edge.to) ?? 0) + semScore);
                                const toFile = edge.to.split("#")[0];
                                if (toFile && toFile !== "external") {
                                    execFileRaw.set(toFile, (execFileRaw.get(toFile) ?? 0) + semScore);
                                }
                            }
                            if (edge.to === node.id) {
                                execRaw.set(edge.from, (execRaw.get(edge.from) ?? 0) + semScore);
                                const fromFile = edge.from.split("#")[0];
                                if (fromFile && fromFile !== "external") {
                                    execFileRaw.set(fromFile, (execFileRaw.get(fromFile) ?? 0) + semScore);
                                }
                            }
                        }
                    }
                }
            }
            const executionSignals = this.normalizeScores(execRaw);
            const executionFileSignals = this.normalizeScores(execFileRaw);

            // Relationship Proximity Signal
            const relRaw = new Map<string, number>();
            const relFileRaw = new Map<string, number>();
            if (options?.includeRelationships !== false) {
                for (const rel of relData.relationships) {
                    const semScore = semanticSignals.get(rel.file);
                    if (semScore !== undefined) {
                        // Find targets matching source/target in relationships
                        for (const edge of relData.relationships) {
                            const sourceId = `${edge.file}#${edge.source}`;
                            const targetId = `${edge.file}#${edge.target}`;
                            if (edge.source === rel.source) {
                                relRaw.set(targetId, (relRaw.get(targetId) ?? 0) + semScore);
                                relFileRaw.set(edge.file, (relFileRaw.get(edge.file) ?? 0) + semScore);
                            }
                            if (edge.target === rel.target) {
                                relRaw.set(sourceId, (relRaw.get(sourceId) ?? 0) + semScore);
                                relFileRaw.set(edge.file, (relFileRaw.get(edge.file) ?? 0) + semScore);
                            }
                        }
                    }
                }
            }
            const relationshipSignals = this.normalizeScores(relRaw);
            const relationshipFileSignals = this.normalizeScores(relFileRaw);

            // Architecture Memory Signal
            const memoryRaw = new Map<string, number>();
            const memoryEntriesMap = new Map<string, any>();
            if (options?.includeArchitectureMemory === true) {
                try {
                    const memoryService = new ArchitectureMemoryService(this.workspaceRoot);
                    const relevantMemory = await memoryService.search(query);
                    const total = relevantMemory.length;
                    for (let i = 0; i < total; i++) {
                        const entry = relevantMemory[i];
                        const entryId = `memory#${entry.id}`;
                        memoryRaw.set(entryId, total - i);
                        memoryEntriesMap.set(entryId, entry);
                    }
                } catch {
                    // ignore memory search errors
                }
            }
            const architectureSignals = this.normalizeScores(memoryRaw);

            // Repository Evolution Signal
            const evolutionRaw = new Map<string, number>();
            if (evolutionExists && evolutionAnalytics.fileHistory.length > 0) {
                const churnRawMap = new Map<string, number>();
                for (const file of evolutionAnalytics.fileHistory) {
                    churnRawMap.set(file.path, file.churnScore);
                }
                const churnSignals = this.normalizeScores(churnRawMap);

                const recencySignals = new Map<string, number>();
                for (const file of evolutionAnalytics.fileHistory) {
                    let rec = 0.3;
                    if (file.recentlyChanged) rec = 1.0;
                    else if (file.stableModule) rec = 0.5;
                    else if (file.abandonedModule) rec = 0.1;
                    recencySignals.set(file.path, rec);
                }

                const coChangeRawMap = new Map<string, number>();
                for (const [semPath, semScore] of semanticSignals.entries()) {
                    for (const rel of evolutionAnalytics.coChangeRelationships) {
                        if (rel.fileA === semPath) {
                            coChangeRawMap.set(rel.fileB, (coChangeRawMap.get(rel.fileB) ?? 0) + rel.count * semScore);
                        }
                        if (rel.fileB === semPath) {
                            coChangeRawMap.set(rel.fileA, (coChangeRawMap.get(rel.fileA) ?? 0) + rel.count * semScore);
                        }
                    }
                }
                const coChangeSignals = this.normalizeScores(coChangeRawMap);

                for (const file of evolutionAnalytics.fileHistory) {
                    const churn = churnSignals.get(file.path) ?? 0;
                    const recency = recencySignals.get(file.path) ?? 0.3;
                    const coChange = coChangeSignals.get(file.path) ?? 0;
                    const combined = 0.4 * churn + 0.4 * recency + 0.2 * coChange;
                    evolutionRaw.set(file.path, combined);
                }
            }
            const evolutionSignals = this.normalizeScores(evolutionRaw);

            // 4. Gather & Merge Candidates
            const candidateMap = new Map<string, KnowledgeCandidate>();

            const getOrCreateCandidate = (id: string, type: "file" | "symbol" | "relationship" | "execution" | "memory", metadata: any = {}): KnowledgeCandidate => {
                let cand = candidateMap.get(id);
                if (!cand) {
                    cand = {
                        id,
                        type,
                        score: 0,
                        provenance: [],
                        metadata,
                        signals: {
                            semantic: 0,
                            execution: 0,
                            relationships: 0,
                            graph: 0,
                            architecture: 0,
                            evolution: 0
                        },
                        confidence: 0,
                        reasons: []
                    };
                    candidateMap.set(id, cand);
                }
                return cand;
            };

            let duplicateCount = 0;

            const addSignalValue = (
                id: string,
                type: "file" | "symbol" | "relationship" | "execution" | "memory",
                source: keyof CandidateSignals,
                val: number,
                metadata: any = {}
            ) => {
                const cand = getOrCreateCandidate(id, type, metadata);
                if (cand.signals[source] > 0) {
                    cand.signals[source] = Math.max(cand.signals[source], val);
                } else {
                    cand.signals[source] = val;
                    if (!cand.provenance.includes(source)) {
                        cand.provenance.push(source);
                    }
                }
            };

            // Add semantic file candidates
            for (const [fPath, val] of semanticSignals.entries()) {
                addSignalValue(fPath, "file", "semantic", val, { path: fPath });
            }

            // Add graph neighbor file candidates
            for (const [fPath, val] of graphSignals.entries()) {
                const hadSem = candidateMap.has(fPath);
                addSignalValue(fPath, "file", "graph", val, { path: fPath });
                if (hadSem) duplicateCount++;
            }

            // Add execution symbol candidates
            for (const [nodeId, val] of executionSignals.entries()) {
                addSignalValue(nodeId, "symbol", "execution", val, { nodeId });
            }

            // Propagate execution to file candidates
            for (const [fPath, val] of executionFileSignals.entries()) {
                const hadSignals = candidateMap.get(fPath)?.provenance.length ?? 0;
                addSignalValue(fPath, "file", "execution", val, { path: fPath });
                if (hadSignals > 0) duplicateCount++;
            }

            // Add relationship symbol candidates
            for (const [symId, val] of relationshipSignals.entries()) {
                addSignalValue(symId, "symbol", "relationships", val, { symId });
            }

            // Propagate relationships to file candidates
            for (const [fPath, val] of relationshipFileSignals.entries()) {
                const hadSignals = candidateMap.get(fPath)?.provenance.length ?? 0;
                addSignalValue(fPath, "file", "relationships", val, { path: fPath });
                if (hadSignals > 0) duplicateCount++;
            }

            // Add architecture memory candidates
            for (const [memId, val] of architectureSignals.entries()) {
                const entry = memoryEntriesMap.get(memId);
                addSignalValue(memId, "memory", "architecture", val, { entry });
            }

            // Add evolution file candidates
            for (const [fPath, val] of evolutionSignals.entries()) {
                const hadSignals = candidateMap.get(fPath)?.provenance.length ?? 0;
                addSignalValue(fPath, "file", "evolution", val, { path: fPath });
                if (hadSignals > 0) duplicateCount++;
            }

            // 5. Score, Confidence, Explainability & deterministic sorting
            const finalCandidates: KnowledgeCandidate[] = [];

            for (const cand of candidateMap.values()) {

                // Score candidate via strategy
                cand.score = this.strategy.score(cand);

                // Compute confidence as the average of active normalized signals
                const activeVals = [
                    cand.signals.semantic,
                    cand.signals.execution,
                    cand.signals.relationships,
                    cand.signals.graph,
                    cand.signals.architecture,
                    cand.signals.evolution
                ].filter(v => v > 0);

                cand.confidence = activeVals.length > 0
                    ? activeVals.reduce((a, b) => a + b, 0) / activeVals.length
                    : 0;

                // Human-readable explainability reasoning
                const reasons: string[] = [];
                if (cand.signals.semantic > 0.01) {
                    reasons.push("Strong keyword similarity with search query");
                }
                if (cand.signals.execution > 0.01) {
                    reasons.push("Direct call or construction connection in execution graph");
                }
                if (cand.signals.relationships > 0.01) {
                    reasons.push("Inheritance or reference relation in AST relationships");
                }
                if (cand.signals.graph > 0.01) {
                    reasons.push("Adjacent neighbor in workspace import dependency graph");
                }
                if (cand.signals.architecture > 0.01) {
                    reasons.push("Relevant matching entry in Architecture Memory");
                }
                if (cand.signals.evolution > 0.01) {
                    reasons.push("Significant historical churn, recency, or co-change activity");
                }
                cand.reasons = reasons;

                finalCandidates.push(cand);

            }

            // Deterministic sorting (tie breaking)
            finalCandidates.sort((a, b) => {
                if (Math.abs(b.score - a.score) > 1e-9) {
                    return b.score - a.score;
                }
                if (a.type !== b.type) {
                    return a.type.localeCompare(b.type);
                }
                return a.id.localeCompare(b.id);
            });

            // 6. Compute Diagnostics
            let semanticContribution = 0;
            let executionContribution = 0;
            let relationshipContribution = 0;
            let graphContribution = 0;
            let architectureContribution = 0;
            let evolutionContribution = 0;

            for (const c of finalCandidates) {
                if (c.provenance.includes("semantic")) semanticContribution++;
                if (c.provenance.includes("execution")) executionContribution++;
                if (c.provenance.includes("relationships")) relationshipContribution++;
                if (c.provenance.includes("graph")) graphContribution++;
                if (c.provenance.includes("architecture")) architectureContribution++;
                if (c.provenance.includes("evolution")) evolutionContribution++;
            }

            const diagnostics: FusionDiagnostics = {
                semanticContribution,
                executionContribution,
                relationshipContribution,
                graphContribution,
                architectureContribution,
                evolutionContribution,
                mergedCandidates: finalCandidates.length,
                duplicateEliminations: duplicateCount
            };

            return {
                candidates: finalCandidates,
                diagnostics
            };

        } catch (error: any) {
            throw new KnowledgeFusionError(`Failed to fuse candidates: ${error.message}`);
        }

    }

    private normalizeScores(scores: Map<string, number>): Map<string, number> {
        const normalized = new Map<string, number>();
        if (scores.size === 0) return normalized;

        let min = Infinity;
        let max = -Infinity;

        for (const score of scores.values()) {
            if (score < min) min = score;
            if (score > max) max = score;
        }

        const range = max - min;

        for (const [id, score] of scores.entries()) {
            if (range === 0) {
                normalized.set(id, 1.0);
            } else {
                normalized.set(id, (score - min) / range);
            }
        }

        return normalized;
    }

}
