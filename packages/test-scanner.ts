import process from "process";

import { ScannerService } from "./scanner/index.js";

async function main() {

    const scanner =
        new ScannerService(
            process.cwd() + "/.brain"
        );

    const snapshot =
        await scanner.snapshot();

    console.dir(
        snapshot,
        {
            depth: 1
        }
    );

}

main();
