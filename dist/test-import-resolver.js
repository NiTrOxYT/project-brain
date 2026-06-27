import process from "process";
import { ImportResolverService } from "./import-resolver/index.js";
async function main() {
    const resolver = new ImportResolverService(process.cwd() + "/.brain");
    const imports = await resolver.resolve();
    console.dir(imports, {
        depth: null
    });
}
main();
