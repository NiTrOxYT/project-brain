export interface GraphNode {

    id: string;

    type: "file";

}

export interface GraphEdge {

    from: string;

    to: string;

    type: "imports";

}

export interface DependencyGraph {

    generatedAt: string;

    nodes: GraphNode[];

    edges: GraphEdge[];

}
