import process from "process";
import { ContextLoaderService, ContextAssembler } from "./context-loader/index.js";
async function main() {
    const loader = new ContextLoaderService(process.cwd() + "/.brain");
    const bundle = await loader.load({
        query: "runtime"
    });
    const context = new ContextAssembler()
        .assemble(bundle);
    console.dir(context, {
        depth: null
    });
}
main();
