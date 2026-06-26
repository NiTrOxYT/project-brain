import fs from "fs/promises";
import ts from "typescript";

import { ParsedSourceFile } from "./types";

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

                file.endsWith(".tsx")
                    ? ts.ScriptKind.TSX
                    : ts.ScriptKind.TS

            );

        return {

            path: file,

            source,

            ast

        };

    }

}
