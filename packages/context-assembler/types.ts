import { ExecutionPlan } from "../planner/index.js";
import { EngineeringPlan } from "../engineering-planner/index.js";
import { ExecutionSchedule, ExecutionReport } from "../orchestrator/index.js";

export interface ContextFile {

    path: string;

    score: number;

    estimatedTokens: number;

    lastModified?: string;

    commitCount?: number;

    churnScore?: number;

    primaryOwner?: string;

}

export interface ContextSymbol {

    name: string;

    kind: string;

    file: string;

    line: number;

}

export interface ContextRelationship {

    source: string;

    target: string;

    type: string;

    file: string;

    line: number;

}

export interface ContextGraphNode {

    id: string;

    type: string;

}

export interface ContextGraphEdge {

    from: string;

    to: string;

    type: string;

}

export interface ContextGraph {

    nodes: ContextGraphNode[];

    edges: ContextGraphEdge[];

}

export interface ContextPackage {

    generatedAt: string;

    query: string;

    plan: ExecutionPlan;

    files: ContextFile[];

    symbols: ContextSymbol[];

    relationships: ContextRelationship[];

    graph: ContextGraph;

    executionGraph?: ContextGraph;

    architectureMemory?: ContextArchitectureEntry[];

    engineeringPlan?: EngineeringPlan;

    executionSchedule?: ExecutionSchedule;
    executionDiagnostics?: ExecutionReport;

    estimatedTokens: number;

}

export interface ContextArchitectureEntry {

    id: string;

    title: string;

    category: string;

    description: string;

    tags: string[];

    relatedFiles: string[];

    relatedSymbols: string[];

    createdAt: string;

    updatedAt: string;

}
