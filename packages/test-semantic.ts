import process from "process";

import { SemanticService } from "./semantic";

async function main() {

    const semantic =
        new SemanticService(
            process.cwd() + "/.brain"
        );

    const result =
        await semantic.build();

    console.dir(
        result,
        {
            depth: null
        }
    );

}

main();
