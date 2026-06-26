export type ExecutionEdgeType =
    | "calls"
    | "constructs"
    | "returns"
    | "throws"
    | "awaits"
    | "reads"
    | "writes";

export interface ExecutionNode {

    id: string;

    symbol: string;

    file: string;

    kind: string;

}

export interface ExecutionEdge {

    from: string;

    to: string;

    type: ExecutionEdgeType;

}

export interface ExecutionGraph {

    generatedAt: string;

    nodes: ExecutionNode[];

    edges: ExecutionEdge[];

}
