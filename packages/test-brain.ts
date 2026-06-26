import process from "process";

import { BrainService } from "./brain";

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
