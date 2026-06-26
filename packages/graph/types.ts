export interface GraphNode {

    id: string;

    type: string;

    path: string;

}

export interface GraphEdge {

    from: string;

    to: string;

    type: string;

}

export interface ProjectGraph {

    nodes: GraphNode[];

    edges: GraphEdge[];

}
