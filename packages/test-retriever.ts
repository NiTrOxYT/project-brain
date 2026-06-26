import process from "process";

import { RetrieverService } from "./retriever";

async function main() {

    const retriever = new RetrieverService(
        process.cwd() + "/.brain"
    );

    const result = await retriever.retrieve({

        query: "runtime"

    });

    console.log(result);

}

main();
