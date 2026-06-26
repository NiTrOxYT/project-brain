import process from "process";
import { banner } from "./banner";
import { RuntimeService } from "../runtime";
export async function run() {
    banner();
    const command = process.argv[2];
    switch (command) {
        case "init": {
            const runtime = new RuntimeService({
                root: process.cwd()
            });
            await runtime.initialize();
            console.log("✅ Project Brain initialized.");
            break;
        }
        default:
            console.log("Unknown command.");
    }
}
