import fs from "fs/promises";
import ts from "typescript";
export class AstService {
    async parse(file) {
        const source = await fs.readFile(file, "utf8");
        const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx")
            ? ts.ScriptKind.TSX
            : ts.ScriptKind.TS);
        return {
            path: file,
            source,
            ast
        };
    }
}
