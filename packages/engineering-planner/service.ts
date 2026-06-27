import fs from "fs/promises";
import path from "path";
import { FileSystemService } from "../filesystem/index.js";
import { ImportResolverService } from "../import-resolver/index.js";
import { ArchitectureMemoryService } from "../architecture-memory/index.js";
import {
    EngineeringPlan,
    EngineeringPlannerRequest,
    ExecutionNode,
    EngineeringPhase,
    TaskType,
    RiskLevel,
    ComplexityLevel,
    PlannerDiagnostics
} from "./types.js";
import { EngineeringPlannerError } from "./errors.js";

interface SymbolRecord {
    name: string;
    kind: string;
    file: string;
    line: number;
}

interface RelationshipRecord {
    source: string;
    target: string;
    type: string;
    file: string;
    line: number;
}

interface ExecutionNodeIdx {
    id: string;
    symbol: string;
    file: string;
    kind: string;
}

interface ExecutionEdgeIdx {
    from: string;
    to: string;
    type: string;
}

export class EngineeringPlannerService {
    private readonly filesystem = new FileSystemService();

    constructor(
        private readonly projectRoot: string,
        private readonly workspaceRoot: string
    ) {}

    async plan(request: EngineeringPlannerRequest): Promise<EngineeringPlan> {
        const startTime = Date.now();
        const { query, intent, candidates } = request;

        try {
            // 1. Identify affected files and symbols from candidates
            const fileCandidates = candidates
                .filter(c => c.type === "file")
                .sort((a, b) => b.score - a.score);

            // Select top 6 candidate files
            const primaryFiles = fileCandidates.slice(0, 6).map(c => c.id);
            const affectedFiles = [...primaryFiles];

            // If empty, look up files in workspace filesystem index
            if (affectedFiles.length === 0) {
                try {
                    const indexData = await this.filesystem.readJson<{ files: { path: string }[] }>(
                        path.join(this.workspaceRoot, "index", "index.json")
                    );
                    if (indexData && indexData.files && indexData.files.length > 0) {
                        // Take top 3 files from index as generic target
                        affectedFiles.push(...indexData.files.slice(0, 3).map(f => f.path));
                    }
                } catch {
                    // Ignore
                }
            }

            const affectedSymbols = candidates
                .filter(c => c.type === "symbol")
                .sort((a, b) => b.score - a.score)
                .slice(0, 15)
                .map(c => c.id);

            // 2. Resolve file dependencies (DAG construction)
            const resolver = new ImportResolverService(this.workspaceRoot);
            const resolvedImports = await resolver.resolve().catch(() => []);

            const dependencyMap = new Map<string, Set<string>>();
            for (const file of affectedFiles) {
                dependencyMap.set(file, new Set<string>());
            }

            // A imports B => A depends on B
            for (const imp of resolvedImports) {
                if (imp.resolved && affectedFiles.includes(imp.source) && affectedFiles.includes(imp.target)) {
                    if (imp.source !== imp.target) {
                        dependencyMap.get(imp.source)!.add(imp.target);
                    }
                }
            }

            // Check relationships for cross-file dependencies
            const relationshipsPath = path.join(this.workspaceRoot, "index", "relationships.json");
            const relationshipsExists = await this.filesystem.exists(relationshipsPath);
            if (relationshipsExists) {
                try {
                    const relData = await this.filesystem.readJson<{ relationships: RelationshipRecord[] }>(relationshipsPath);
                    const symbolsData = await this.filesystem.readJson<{ symbols: SymbolRecord[] }>(
                        path.join(this.workspaceRoot, "index", "symbols.json")
                    );

                    const symbolToFile = new Map<string, string>();
                    for (const s of symbolsData.symbols) {
                        symbolToFile.set(s.name, s.file);
                    }

                    for (const r of relData.relationships) {
                        const sourceFile = r.file;
                        const targetFile = symbolToFile.get(r.target);
                        if (sourceFile && targetFile && sourceFile !== targetFile) {
                            if (affectedFiles.includes(sourceFile) && affectedFiles.includes(targetFile)) {
                                dependencyMap.get(sourceFile)!.add(targetFile);
                            }
                        }
                    }
                } catch {
                    // Ignore
                }
            }

            // Break cycles to ensure DAG (simple topological constraint check)
            const dependencyEdges: { from: string; to: string }[] = [];
            const visited = new Set<string>();
            const recursionStack = new Set<string>();

            const addEdgeAcyclic = (from: string, to: string) => {
                // If it creates a cycle, skip
                const wouldCreateCycle = (src: string, target: string, pathSet: Set<string>): boolean => {
                    if (src === target) return true;
                    pathSet.add(src);
                    const currentDeps = dependencyMap.get(src);
                    if (currentDeps) {
                        for (const d of currentDeps) {
                            if (pathSet.has(d)) continue;
                            if (wouldCreateCycle(d, target, new Set(pathSet))) return true;
                        }
                    }
                    return false;
                };

                const pathSet = new Set<string>();
                if (!wouldCreateCycle(to, from, pathSet)) {
                    dependencyEdges.push({ from, to });
                }
            };

            for (const [sourceFile, targetDeps] of dependencyMap.entries()) {
                for (const targetFile of targetDeps) {
                    addEdgeAcyclic(targetFile, sourceFile); // target must change before source
                }
            }

            // Calculate max dependency depth
            const computeDepth = (file: string, currentPath: Set<string>): number => {
                let maxD = 0;
                const deps = dependencyMap.get(file);
                if (deps) {
                    for (const d of deps) {
                        if (currentPath.has(d)) continue;
                        currentPath.add(d);
                        maxD = Math.max(maxD, 1 + computeDepth(d, new Set(currentPath)));
                    }
                }
                return maxD;
            };

            let maxDependencyDepth = 0;
            for (const file of affectedFiles) {
                maxDependencyDepth = Math.max(maxDependencyDepth, computeDepth(file, new Set([file])));
            }

            // 3. Structured Risk Analysis
            let maxChurn = 1;
            let maxContributors = 1;
            let ownershipDispersionMax = 0;
            const evolutionPath = path.join(this.workspaceRoot, "index", "evolution", "analytics.json");
            const evolutionExists = await this.filesystem.exists(evolutionPath);
            if (evolutionExists) {
                try {
                    const evoData = await this.filesystem.readJson<{ fileHistory: any[] }>(evolutionPath);
                    for (const f of evoData.fileHistory) {
                        if (affectedFiles.includes(f.path)) {
                            maxChurn = Math.max(maxChurn, f.churnScore || 1);
                            maxContributors = Math.max(maxContributors, f.activeContributors || 1);
                            const dispersion = (f.activeContributors || 1) * (1 - (f.ownershipConfidence ?? 1.0));
                            ownershipDispersionMax = Math.max(ownershipDispersionMax, dispersion);
                        }
                    }
                } catch {
                    // Ignore
                }
            }

            let executionEdgesCount = 0;
            let executionInDegreeMax = 0;
            const execPath = path.join(this.workspaceRoot, "index", "execution-graph.json");
            const execExists = await this.filesystem.exists(execPath);
            if (execExists) {
                try {
                    const execData = await this.filesystem.readJson<{ nodes: ExecutionNodeIdx[]; edges: ExecutionEdgeIdx[] }>(execPath);
                    const fileNodes = execData.nodes.filter(n => affectedFiles.includes(n.file));
                    const nodeIds = new Set(fileNodes.map(n => n.id));
                    
                    const inDegree = new Map<string, number>();
                    for (const edge of execData.edges) {
                        if (nodeIds.has(edge.to)) {
                            executionEdgesCount++;
                            inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
                        }
                    }
                    if (inDegree.size > 0) {
                        executionInDegreeMax = Math.max(...inDegree.values());
                    }
                } catch {
                    // Ignore
                }
            }

            let architectureScore = 0;
            try {
                const memoryService = new ArchitectureMemoryService(this.workspaceRoot);
                const memEntries = await memoryService.list().catch(() => []);
                for (const file of affectedFiles) {
                    const filename = path.basename(file).toLowerCase();
                    const matchesRule = memEntries.some((entry: any) => 
                        entry.title.toLowerCase().includes(filename) || 
                        entry.relatedFiles.some((f: any) => f.includes(file))
                    );
                    if (matchesRule) {
                        architectureScore = 50; // Invariant warning risk
                        break;
                    }
                }
            } catch {
                // Ignore
            }

            // Normalize sub-risk indicators (0-100)
            const riskApi = Math.min(100, affectedFiles.length * 15);
            const riskExecution = Math.min(100, executionInDegreeMax * 20);
            const riskHistory = Math.min(100, maxChurn * 10);
            const riskArchitecture = architectureScore;
            const riskOwnership = Math.min(100, Math.round(ownershipDispersionMax * 25));

            const averageRiskScore = Math.round((riskApi + riskExecution + riskHistory + riskArchitecture + riskOwnership) / 5);
            let riskOverall: RiskLevel = "Low";
            if (averageRiskScore >= 75) riskOverall = "Critical";
            else if (averageRiskScore >= 50) riskOverall = "High";
            else if (averageRiskScore >= 25) riskOverall = "Medium";

            // 4. Complexity Scoring
            const complexityScore = (affectedFiles.length * 8) + (affectedSymbols.length * 2) + (maxDependencyDepth * 15) + (executionEdgesCount * 0.5) + (maxChurn * 0.5);
            let complexityLabel: ComplexityLevel = "Small";
            if (complexityScore >= 120) complexityLabel = "Very Large";
            else if (complexityScore >= 60) complexityLabel = "Large";
            else if (complexityScore >= 25) complexityLabel = "Medium";

            // 5. Planner Confidence
            let fusionConfidence = candidates.length > 0 ? candidates[0].confidence ?? 0.8 : 0.5;
            let dependencyQuality = resolvedImports.length > 0 ? 0.9 : 0.7;
            const overallConfidence = Math.min(1.0, Math.max(0.1, (fusionConfidence * 0.5) + (dependencyQuality * 0.3) + 0.2));

            // 6. Detect Missing Information
            const missingInformation: string[] = [];
            const queryLower = query.toLowerCase();
            const topCandidates = candidates.slice(0, 10);
            if (queryLower.includes("database") || queryLower.includes("db") || queryLower.includes("schema")) {
                const hasDbCandidates = topCandidates.some(c => c.id.toLowerCase().includes("db") || c.id.toLowerCase().includes("schema") || c.id.toLowerCase().includes("sql"));
                if (!hasDbCandidates) {
                    missingInformation.push("Database schema or connection configuration not found in workspace index");
                }
            }
            if (queryLower.includes("api") || queryLower.includes("service")) {
                const hasApiCandidates = topCandidates.some(c => c.id.toLowerCase().includes("api") || c.id.toLowerCase().includes("service"));
                if (!hasApiCandidates) {
                    missingInformation.push("Missing external API integrations or service endpoints definitions");
                }
            }

            // 7. Generate Tasks and Rollbacks (Phased, Deterministic Sequential TASK IDs)
            let taskIdCounter = 1;
            const nextTaskId = () => `TASK-${String(taskIdCounter++).padStart(6, "0")}`;

            const phases: EngineeringPhase[] = [
                { id: "PHASE-1", name: "Analyze", tasks: [] },
                { id: "PHASE-2", name: "Modify", tasks: [] },
                { id: "PHASE-3", name: "Validate", tasks: [] },
                { id: "PHASE-4", name: "Test", tasks: [] },
                { id: "PHASE-5", name: "Cleanup", tasks: [] }
            ];

            const phaseTasks = new Map<string, string[]>();
            for (const p of phases) {
                phaseTasks.set(p.id, []);
            }

            const tasksList: ExecutionNode[] = [];
            const fileToAnalyzeTaskId = new Map<string, string>();
            const fileToModifyTaskId = new Map<string, string>();
            const fileToTestTaskId = new Map<string, string>();
            const fileToValidateTaskId = new Map<string, string>();

            // PHASE 1: Analyze tasks (independent)
            for (const file of affectedFiles) {
                const tId = nextTaskId();
                fileToAnalyzeTaskId.set(file, tId);
                const fileSymbols = affectedSymbols.filter(s => s.startsWith(file));

                const analyzeTask: ExecutionNode = {
                    id: tId,
                    title: `Analyze ${path.basename(file)}`,
                    description: `Understand structure, imports, and symbol references of ${file}`,
                    type: "analyze",
                    phaseId: "PHASE-1",
                    file,
                    prerequisites: [],
                    estimatedEffort: 0.5,
                    estimatedTokens: 1000,
                    estimatedLOC: 0,
                    estimatedFiles: 1,
                    validationRequirements: [`Verify structure of ${file}`, `Analyze dependencies`],
                    rationale: [`Identify key entry points for modifications`, `Inspect call hierarchies`],
                    affectedSymbols: fileSymbols
                };
                tasksList.push(analyzeTask);
                phaseTasks.get("PHASE-1")!.push(tId);
            }

            // PHASE 2: Modify tasks (structured with dependencies)
            for (const file of affectedFiles) {
                const tId = nextTaskId();
                fileToModifyTaskId.set(file, tId);
                const fileSymbols = affectedSymbols.filter(s => s.startsWith(file));

                let taskType: TaskType = "modify";
                if (intent === "refactor") taskType = "refactor";
                else if (intent === "documentation") taskType = "document";
                else if (intent === "test") taskType = "test";

                // Check if file doesn't exist to mark as create
                let fileExists = true;
                try {
                    await fs.access(path.join(this.projectRoot, file));
                } catch {
                    fileExists = false;
                    taskType = "create";
                }

                const modifyTask: ExecutionNode = {
                    id: tId,
                    title: `${taskType.charAt(0).toUpperCase() + taskType.slice(1)} ${path.basename(file)}`,
                    description: `Implement required logic changes in ${file}`,
                    type: taskType,
                    phaseId: "PHASE-2",
                    file,
                    prerequisites: [fileToAnalyzeTaskId.get(file)!], // depends on own analysis
                    estimatedEffort: taskType === "create" ? 3.0 : 2.0,
                    estimatedTokens: 3000,
                    estimatedLOC: taskType === "create" ? 150 : 80,
                    estimatedFiles: 1,
                    validationRequirements: [`Ensure no syntax errors`, `Verify TypeScript compilation`],
                    rationale: [`Core target defined by user query: "${query}"`],
                    affectedSymbols: fileSymbols
                };

                // Add rationales based on repository features
                if (maxChurn > 10) modifyTask.rationale.push("High historical churn file; handle with care");
                if (riskArchitecture > 0) modifyTask.rationale.push("Matches architectural invariants recorded in memory");

                tasksList.push(modifyTask);
                phaseTasks.get("PHASE-2")!.push(tId);
            }

            // Apply cross-file prerequisites to Modify tasks using acyclic dependencyEdges
            for (const edge of dependencyEdges) {
                const fromModId = fileToModifyTaskId.get(edge.from);
                const toModId = fileToModifyTaskId.get(edge.to);
                if (fromModId && toModId) {
                    const toNode = tasksList.find(t => t.id === toModId)!;
                    if (!toNode.prerequisites.includes(fromModId)) {
                        toNode.prerequisites.push(fromModId);
                    }
                }
            }

            // PHASE 3: Validate tasks
            for (const file of affectedFiles) {
                const tId = nextTaskId();
                fileToValidateTaskId.set(file, tId);
                const fileSymbols = affectedSymbols.filter(s => s.startsWith(file));

                const valTask: ExecutionNode = {
                    id: tId,
                    title: `Validate API of ${path.basename(file)}`,
                    description: `Check import resolutions and exported declarations for ${file}`,
                    type: "validate",
                    phaseId: "PHASE-3",
                    file,
                    prerequisites: [fileToModifyTaskId.get(file)!],
                    estimatedEffort: 0.5,
                    estimatedTokens: 500,
                    estimatedLOC: 0,
                    estimatedFiles: 1,
                    validationRequirements: [`Ensure no broken call-sites in downstream dependencies`],
                    rationale: [`Protect public interfaces from accidental breakage`],
                    affectedSymbols: fileSymbols
                };
                tasksList.push(valTask);
                phaseTasks.get("PHASE-3")!.push(tId);
            }

            // Project Wide Validation Task (Phase 3)
            const projValId = nextTaskId();
            const projectValTask: ExecutionNode = {
                id: projValId,
                title: "Validate full build",
                description: "Execute compiler and run regression test suite over the entire repository workspace",
                type: "validate",
                phaseId: "PHASE-3",
                prerequisites: Array.from(fileToValidateTaskId.values()),
                estimatedEffort: 1.0,
                estimatedTokens: 1000,
                estimatedLOC: 0,
                estimatedFiles: affectedFiles.length,
                validationRequirements: [`tsc build success`, `All workspace tests pass`],
                rationale: [`Ensure full system integration and verify codebase stability before staging`],
                affectedSymbols: []
            };
            tasksList.push(projectValTask);
            phaseTasks.get("PHASE-3")!.push(projValId);

            // PHASE 4: Test tasks
            for (const file of affectedFiles) {
                const tId = nextTaskId();
                fileToTestTaskId.set(file, tId);
                const fileSymbols = affectedSymbols.filter(s => s.startsWith(file));

                const testTask: ExecutionNode = {
                    id: tId,
                    title: `Test changes in ${path.basename(file)}`,
                    description: `Write and run test cases for logic inside ${file}`,
                    type: "test",
                    phaseId: "PHASE-4",
                    file,
                    prerequisites: [fileToValidateTaskId.get(file)!],
                    estimatedEffort: 1.5,
                    estimatedTokens: 1500,
                    estimatedLOC: 60,
                    estimatedFiles: 1,
                    validationRequirements: [`Verify all tests pass`, `Verify coverage requirements`],
                    rationale: [`Validate correct behavior under edge cases`],
                    affectedSymbols: fileSymbols
                };
                tasksList.push(testTask);
                phaseTasks.get("PHASE-4")!.push(tId);
            }

            // PHASE 5: Rollback Tasks (Cleanup Phase)
            // Generate rollback tasks for each Modify/Create task
            for (const file of affectedFiles) {
                const modifyId = fileToModifyTaskId.get(file)!;
                const modifyNode = tasksList.find(t => t.id === modifyId)!;

                const rollId = nextTaskId();
                modifyNode.rollbackTaskId = rollId;

                const rollbackTask: ExecutionNode = {
                    id: rollId,
                    title: `Rollback changes in ${path.basename(file)}`,
                    description: `Discard unstaged modifications or delete created files to restore original state of ${file}`,
                    type: "cleanup",
                    phaseId: "PHASE-5",
                    file,
                    prerequisites: [], // independent, available on demand
                    estimatedEffort: 0.5,
                    estimatedTokens: 500,
                    estimatedLOC: 0,
                    estimatedFiles: 1,
                    validationRequirements: [`git diff is clean for ${file}`, `Build compiles after revert`],
                    rationale: [`Provide clean undo option for safety during autonomous execution`],
                    isRollback: true,
                    rollbackForTaskId: modifyId,
                    affectedSymbols: []
                };
                tasksList.push(rollbackTask);
                phaseTasks.get("PHASE-5")!.push(rollId);
            }

            // Map phase tasks back to the phase structure
            for (const p of phases) {
                p.tasks = phaseTasks.get(p.id)!;
            }

            // Build DAG Execution Graph structure
            const graphNodes: string[] = tasksList.filter(t => !t.isRollback).map(t => t.id);
            const graphEdges: { from: string; to: string }[] = [];
            for (const node of tasksList) {
                if (node.isRollback) continue;
                for (const prereq of node.prerequisites) {
                    graphEdges.push({ from: prereq, to: node.id });
                }
            }

            // 8. General estimates
            const estimatedDuration = tasksList.reduce((acc, t) => acc + t.estimatedEffort, 0);
            const estimatedTokens = tasksList.reduce((acc, t) => acc + t.estimatedTokens, 0);
            const estimatedLOC = tasksList.reduce((acc, t) => acc + t.estimatedLOC, 0);

            // 9. Validation checklist
            const validationChecklist = [
                "Verify workspace builds successfully via tsc",
                "Ensure imports resolve correctly across packages",
                "Execute modified test modules and verify all test cases pass",
                "Verify caller declarations are not broken by public interface adjustments",
                "Verify architectural memory rules and check for warnings"
            ];

            const goal = `Fulfill intent "${intent}" for request: "${query}"`;
            const summary = `Deterministic execution plan designed to implement changes. Scope targets ${affectedFiles.length} files with estimated duration of ${estimatedDuration.toFixed(1)} hours. Overall risk: ${riskOverall}. Complexity: ${complexityLabel}.`;

            const planningTimeMs = Date.now() - startTime;

            const diagnostics: PlannerDiagnostics = {
                planningTimeMs,
                graphNodes: graphNodes.length,
                graphEdges: graphEdges.length,
                dependencyDepth: maxDependencyDepth,
                affectedModules: affectedFiles.length,
                complexity: complexityLabel,
                riskScore: averageRiskScore
            };

            return {
                goal,
                summary,
                intent,
                confidence: overallConfidence,
                complexity: {
                    score: complexityScore,
                    label: complexityLabel
                },
                risk: {
                    api: riskApi,
                    execution: riskExecution,
                    history: riskHistory,
                    architecture: riskArchitecture,
                    ownership: riskOwnership,
                    overall: riskOverall
                },
                phases,
                tasks: tasksList,
                executionGraph: {
                    nodes: graphNodes,
                    edges: graphEdges
                },
                affectedFiles,
                affectedSymbols,
                validationChecklist,
                missingInformation,
                estimatedTokens,
                estimatedLOC,
                estimatedDuration,
                diagnostics
            };

        } catch (error: any) {
            throw new EngineeringPlannerError(`Failed to generate engineering plan: ${error.message}`);
        }
    }
}
