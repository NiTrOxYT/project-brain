export type TaskType =
    | "analyze"
    | "create"
    | "modify"
    | "refactor"
    | "delete"
    | "validate"
    | "document"
    | "test"
    | string;

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export type ComplexityLevel = "Small" | "Medium" | "Large" | "Very Large";

export interface ExecutionNode {
    id: string;
    title: string;
    description: string;
    type: TaskType;
    phaseId: string;
    file?: string;
    symbol?: string;
    affectedFiles?: string[];
    affectedSymbols?: string[];
    prerequisites: string[];
    estimatedEffort: number;
    estimatedTokens: number;
    estimatedLOC: number;
    estimatedFiles: number;
    validationRequirements: string[];
    rationale: string[];
    isRollback?: boolean;
    rollbackTaskId?: string;
    rollbackForTaskId?: string;
}

export interface EngineeringPhase {
    id: string;
    name: string;
    tasks: string[];
}

export interface ExecutionGraph {
    nodes: string[];
    edges: { from: string; to: string }[];
}

export interface PlannerDiagnostics {
    planningTimeMs: number;
    graphNodes: number;
    graphEdges: number;
    dependencyDepth: number;
    affectedModules: number;
    complexity: ComplexityLevel;
    riskScore: number;
}

export interface EngineeringPlan {
    goal: string;
    summary: string;
    intent: string;
    confidence: number;
    complexity: {
        score: number;
        label: ComplexityLevel;
    };
    risk: {
        api: number;
        execution: number;
        history: number;
        architecture: number;
        ownership: number;
        overall: RiskLevel;
    };
    phases: EngineeringPhase[];
    tasks: ExecutionNode[];
    executionGraph: ExecutionGraph;
    affectedFiles: string[];
    affectedSymbols: string[];
    validationChecklist: string[];
    missingInformation: string[];
    estimatedTokens: number;
    estimatedLOC: number;
    estimatedDuration: number;
    diagnostics: PlannerDiagnostics;
}

export interface EngineeringPlannerRequest {
    query: string;
    intent: string;
    candidates: any[];
}
