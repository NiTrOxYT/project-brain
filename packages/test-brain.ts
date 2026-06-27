import process from "process";

import { BrainService } from "./brain/index.js";

async function main() {

    const brain =
        new BrainService(
            process.cwd() + "/.brain"
        );

    const result =
        await brain.execute({

            prompt:
                "Add authentication middleware"

        });

    console.dir(
        result,
        {
            depth: null
        }
    );

}

main();
