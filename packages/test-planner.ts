import process from "process";

import { PlannerService } from "./planner";

async function main() {

    const planner =
        new PlannerService(
            process.cwd() + "/.brain"
        );

    const prompts = [

        "Add JWT authentication middleware",

        "Fix runtime initialization error",

        "Refactor workspace service",

        "Write tests for graph builder",

        "Document manifest format",

        "Analyze dependency graph"

    ];

    for (const prompt of prompts) {

        console.log();
        console.log("=================================");
        console.log(prompt);
        console.log("=================================");

        console.dir(
            await planner.plan(prompt),
            {
                depth: null
            }
        );

    }

}

main().catch(console.error);
