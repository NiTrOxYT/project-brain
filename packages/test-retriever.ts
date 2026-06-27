import process from "process";

import {

    RetrieverService

} from "./retriever/index.js";

async function main() {

    const retriever =
        new RetrieverService(
            process.cwd() + "/.brain"
        );

    const queries = [

        "runtime",

        "workspace",

        "semantic",

        "graph",

        "manifest",

        "authentication"

    ];

    for (const query of queries) {

        console.log();

        console.log(
            "=========="
        );

        console.log(query);

        console.log(
            "=========="
        );

        console.dir(

            await retriever.retrieve({

                query,

                limit: 10

            }),

            {

                depth: null

            }

        );

    }

}

main();