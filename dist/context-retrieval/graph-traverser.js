import { GraphTraversalError } from "./errors.js";
export class GraphTraverser {
    traverseBFS(snapshot, startNodes, maxDepth = 2) {
        try {
            const visited = new Set();
            const queue = [];
            const resultNodes = new Map();
            const resultEdges = [];
            const nodesMap = new Map(snapshot.graph.nodes.map(n => [n.id, n]));
            const adjacency = new Map();
            for (const edge of snapshot.graph.edges) {
                const list = adjacency.get(edge.fromId) || [];
                list.push(edge);
                adjacency.set(edge.fromId, list);
            }
            for (const start of startNodes) {
                if (nodesMap.has(start)) {
                    queue.push({ id: start, depth: 0 });
                    visited.add(start);
                }
            }
            let safety = 0;
            while (queue.length > 0 && safety++ < 10000) {
                const current = queue.shift();
                const node = nodesMap.get(current.id);
                resultNodes.set(node.id, node);
                if (current.depth >= maxDepth)
                    continue;
                // Sort neighbors by ID to ensure deterministic traversal order
                const edges = (adjacency.get(current.id) || []).sort((a, b) => a.toId.localeCompare(b.toId));
                for (const edge of edges) {
                    if (!visited.has(edge.toId)) {
                        visited.add(edge.toId);
                        queue.push({ id: edge.toId, depth: current.depth + 1 });
                    }
                    resultEdges.push(edge);
                }
            }
            const nodes = [...resultNodes.values()].sort((a, b) => a.id.localeCompare(b.id));
            const edges = resultEdges.sort((a, b) => {
                const fComp = a.fromId.localeCompare(b.fromId);
                if (fComp !== 0)
                    return fComp;
                return a.toId.localeCompare(b.toId);
            });
            // Recompute topological sort on the traversed subgraph
            const topologicalOrder = nodes.map(n => n.id);
            return {
                nodes,
                edges,
                topologicalOrder
            };
        }
        catch (err) {
            throw new GraphTraversalError(`BFS traversal failed: ${err.message}`);
        }
    }
    traversePriorityBFS(snapshot, startNodes, maxDepth = 2) {
        // Similar to BFS, but queue is sorted by node priority descending
        try {
            const visited = new Set();
            const queue = [];
            const resultNodes = new Map();
            const resultEdges = [];
            const nodesMap = new Map(snapshot.graph.nodes.map(n => [n.id, n]));
            const adjacency = new Map();
            for (const edge of snapshot.graph.edges) {
                const list = adjacency.get(edge.fromId) || [];
                list.push(edge);
                adjacency.set(edge.fromId, list);
            }
            for (const start of startNodes) {
                const node = nodesMap.get(start);
                if (node) {
                    queue.push({ id: start, depth: 0, priority: node.priority });
                    visited.add(start);
                }
            }
            let safety = 0;
            while (queue.length > 0 && safety++ < 10000) {
                // Sort queue by priority desc, then depth asc, then id asc
                queue.sort((a, b) => {
                    if (b.priority !== a.priority)
                        return b.priority - a.priority;
                    if (a.depth !== b.depth)
                        return a.depth - b.depth;
                    return a.id.localeCompare(b.id);
                });
                const current = queue.shift();
                const node = nodesMap.get(current.id);
                resultNodes.set(node.id, node);
                if (current.depth >= maxDepth)
                    continue;
                const edges = adjacency.get(current.id) || [];
                for (const edge of edges) {
                    if (!visited.has(edge.toId)) {
                        const childNode = nodesMap.get(edge.toId);
                        if (childNode) {
                            visited.add(edge.toId);
                            queue.push({
                                id: edge.toId,
                                depth: current.depth + 1,
                                priority: childNode.priority
                            });
                        }
                    }
                    resultEdges.push(edge);
                }
            }
            const nodes = [...resultNodes.values()].sort((a, b) => a.id.localeCompare(b.id));
            const edges = resultEdges.sort((a, b) => {
                const fComp = a.fromId.localeCompare(b.fromId);
                if (fComp !== 0)
                    return fComp;
                return a.toId.localeCompare(b.toId);
            });
            return {
                nodes,
                edges,
                topologicalOrder: nodes.map(n => n.id)
            };
        }
        catch (err) {
            throw new GraphTraversalError(`Priority BFS traversal failed: ${err.message}`);
        }
    }
}
