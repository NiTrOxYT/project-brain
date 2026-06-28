import fs from "fs/promises";
import path from "path";
import ts from "typescript";

import { ParsedSourceFile } from "./types.js";

export class AstService {

    async parse(
        file: string
    ): Promise<ParsedSourceFile> {

        const source =
            await fs.readFile(
                file,
                "utf8"
            );

        const ast =
            ts.createSourceFile(

                file,

                source,

                ts.ScriptTarget.Latest,

                true,

                (() => {
                    const ext = path.extname(file).toLowerCase();
                    if (ext === ".tsx") return ts.ScriptKind.TSX;
                    if (ext === ".jsx") return ts.ScriptKind.JSX;
                    if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return ts.ScriptKind.JS;
                    return ts.ScriptKind.TS;
                })()

            );

        return {

            path: file,

            source,

            ast

        };

    }

}
