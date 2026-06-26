import process from "process";
import { SymbolsService } from "./symbols";
async function main() {
    const service = new SymbolsService(process.cwd(), ".brain");
    const result = await service.index();
    console.log(result.symbols);
}
main().catch(console.error);
