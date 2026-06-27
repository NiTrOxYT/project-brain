import process from "process";
import path from "path";
import ts from "typescript";

import { AstService } from "./ast/index.js";

async function main() {

    const parser =
        new AstService();

    const file =
        path.join(
            process.cwd(),
            "packages",
            "runtime",
            "service.ts"
        );

    const parsed =
        await parser.parse(file);

    console.log(
        parsed.path
    );

    let count = 0;

    function visit(
        node: ts.Node
    ) {

        count++;

        console.log(

            ts.SyntaxKind[node.kind]

        );

        ts.forEachChild(
            node,
            visit
        );

    }

    visit(
        parsed.ast
    );

    console.log();
    console.log(
        "Nodes:",
        count
    );

}

main().catch(console.error);
