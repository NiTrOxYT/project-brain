import fs from "fs/promises";
import path from "path";
import ts from "typescript";

import { AstService } from "../ast/index.js";
import { FileSystemService } from "../filesystem/index.js";

import {

    SymbolIndex,
    SymbolRecord

} from "./types.js";

export class SymbolsService {

    private readonly filesystem =
        new FileSystemService();

    private readonly parser =
        new AstService();

    constructor(

        private readonly projectRoot: string,

        private readonly workspaceRoot: string

    ) { }

    async extractFromFile(relativePath: string): Promise<SymbolRecord[]> {

        const fullPath = path.join(this.projectRoot, relativePath);

        const parsed = await this.parser.parse(fullPath);

        const output: SymbolRecord[] = [];

        this.extract(

            parsed.ast,

            fullPath,

            output

        );

        return output;

    }

    async index(): Promise<SymbolIndex> {

        const symbols: SymbolRecord[] = [];

        await this.walk(

            this.projectRoot,

            symbols

        );

        const index: SymbolIndex = {

            generatedAt:

                new Date().toISOString(),

            symbols

        };

        await this.filesystem.writeJson(

            path.join(

                this.workspaceRoot,

                "index",

                "symbols.json"

            ),

            index

        );

        return index;

    }

    private async walk(

        directory: string,

        output: SymbolRecord[]

    ): Promise<void> {

        const entries =
            await fs.readdir(

                directory,

                {

                    withFileTypes: true

                }

            );

        for (const entry of entries) {

            if (

                entry.name === ".git" ||

                entry.name === ".brain" ||

                entry.name === "node_modules" ||

                entry.name === "dist"

            ) {

                continue;

            }

            const fullPath =
                path.join(

                    directory,

                    entry.name

                );

            if (entry.isDirectory()) {

                await this.walk(

                    fullPath,

                    output

                );

                continue;

            }

            if (

                !fullPath.endsWith(".ts") &&

                !fullPath.endsWith(".tsx")

            ) {

                continue;

            }

            const parsed =
                await this.parser.parse(

                    fullPath

                );

            this.extract(

                parsed.ast,

                fullPath,

                output

            );

        }

    }

    private extract(

        source: ts.SourceFile,

        file: string,

        output: SymbolRecord[]

    ): void {

        const visit = (

            node: ts.Node

        ) => {

            let kind:
                SymbolRecord["kind"] | undefined;

            let name:
                string | undefined;

            if (ts.isClassDeclaration(node)) {

                kind = "class";

                name = node.name?.text;

            }

            else if (

                ts.isInterfaceDeclaration(node)

            ) {

                kind = "interface";

                name = node.name.text;

            }

            else if (

                ts.isTypeAliasDeclaration(node)

            ) {

                kind = "type";

                name = node.name.text;

            }

            else if (

                ts.isEnumDeclaration(node)

            ) {

                kind = "enum";

                name = node.name.text;

            }

            else if (

                ts.isFunctionDeclaration(node)

            ) {

                kind = "function";

                name = node.name?.text;

            }

            else if (

                ts.isMethodDeclaration(node)

            ) {

                kind = "method";

                name = node.name.getText(source);

            }

            else if (

                ts.isConstructorDeclaration(node)

            ) {

                kind = "constructor";

                name = "constructor";

            }

            else if (

                ts.isPropertyDeclaration(node)

            ) {

                kind = "property";

                name = node.name.getText(source);

            }

            else if (

                ts.isVariableDeclaration(node)

            ) {

                kind = "variable";

                if (

                    ts.isIdentifier(node.name)

                ) {

                    name = node.name.text;

                }

            }

            if (

                kind &&

                name

            ) {

                const position =
                    source.getLineAndCharacterOfPosition(

                        node.getStart()

                    );

                output.push({

                    name,

                    kind,

                    file: path.relative(

                        this.projectRoot,

                        file

                    ),

                    line:

                        position.line + 1

                });

            }

            ts.forEachChild(

                node,

                visit

            );

        };

        visit(source);

    }

}