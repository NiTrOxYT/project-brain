import process from "process";
import { ImportResolverService } from "./import-resolver";
async function main() {
    const resolver = new ImportResolverService(process.cwd() + "/.brain");
    const imports = await resolver.resolve();
    console.dir(imports, {
        depth: null
    });
}
main();
