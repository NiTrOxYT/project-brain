import process from "process";
import path from "path";
import fs from "fs/promises";

import { RuntimeService } from "./runtime/index.js";
import { ExecutionGraphService } from "./execution-graph/index.js";

async function main() {

    const workspaceRoot = path.join(process.cwd(), ".brain");

    console.log("Setting up workspace database...");
    const runtime = new RuntimeService({
        root: process.cwd()
    });
    await runtime.initialize();

    console.log("Building Execution Graph...");
    const service = new ExecutionGraphService(workspaceRoot);
    const graph = await service.build();

    const graphPath = path.join(workspaceRoot, "index", "execution-graph.json");
    const exists = await fs.access(graphPath).then(() => true).catch(() => false);
    console.log(`execution-graph.json exists: ${exists}`);

    if (!exists) {
        console.error("FAIL: execution-graph.json not found!");
        process.exit(1);
    }

    console.log("\n--- Execution Graph Statistics ---");
    console.log(`Total execution nodes: ${graph.nodes.length}`);
    console.log(`Total execution edges: ${graph.edges.length}`);

    const typeCounts: Record<string, number> = {
        calls: 0,
        constructs: 0,
        awaits: 0
    };

    for (const edge of graph.edges) {
        if (edge.type in typeCounts) {
            typeCounts[edge.type]++;
        }
    }

    console.log(`Calls: ${typeCounts.calls}`);
    console.log(`Constructs: ${typeCounts.constructs}`);
    console.log(`Awaits: ${typeCounts.awaits}`);

    // Compute connectivity (degree) for each node
    const nodeDegrees = new Map<string, number>();
    for (const node of graph.nodes) {
        nodeDegrees.set(node.id, 0);
    }

    for (const edge of graph.edges) {
        if (nodeDegrees.has(edge.from)) {
            nodeDegrees.set(edge.from, nodeDegrees.get(edge.from)! + 1);
        }
        if (nodeDegrees.has(edge.to)) {
            nodeDegrees.set(edge.to, nodeDegrees.get(edge.to)! + 1);
        }
    }

    const sortedNodes = [...graph.nodes].sort((a, b) => {
        const degA = nodeDegrees.get(a.id) || 0;
        const degB = nodeDegrees.get(b.id) || 0;
        return degB - degA;
    });

    console.log("\nTop 20 most connected execution nodes:");
    const top20 = sortedNodes.slice(0, 20);
    for (let i = 0; i < top20.length; i++) {
        const node = top20[i];
        const deg = nodeDegrees.get(node.id) || 0;
        console.log(`  ${i + 1}. ${node.symbol} (file: ${node.file}, kind: ${node.kind}) — connections: ${deg}`);
    }
    console.log("----------------------------------");

}

main().catch(error => {
    console.error("Test failed:", error);
    process.exit(1);
});
