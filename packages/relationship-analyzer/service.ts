import fs from "fs/promises";
import path from "path";
import ts from "typescript";

import { AstService } from "../ast";
import { FileSystemService } from "../filesystem";
import {
    RelationshipIndex,
    RelationshipRecord
} from "./types";
import { RelationshipAnalyzerError } from "./errors";

export class RelationshipAnalyzerService {

    private readonly filesystem = new FileSystemService();
    private readonly parser = new AstService();

    constructor(
        private readonly projectRoot: string,
        private readonly workspaceRoot: string
    ) {}

    async extractFromFile(relativePath: string, projectSymbols: Set<string>): Promise<RelationshipRecord[]> {

        const fullPath = path.join(this.projectRoot, relativePath);

        const parsed = await this.parser.parse(fullPath);

        const output: RelationshipRecord[] = [];

        this.extractRelationships(

            parsed.ast,

            relativePath,

            projectSymbols,

            output

        );

        return output;

    }

    async analyze(): Promise<RelationshipIndex> {

        try {

            const symbolsPath = path.join(
                this.workspaceRoot,
                "index",
                "symbols.json"
            );

            if (!(await this.filesystem.exists(symbolsPath))) {
                throw new RelationshipAnalyzerError("symbols.json index file does not exist");
            }

            const symbolsData = await this.filesystem.readJson<{ symbols: any[] }>(symbolsPath);
            const projectSymbols = new Set<string>(
                symbolsData.symbols.map(sym => sym.name)
            );

            const indexPath = path.join(
                this.workspaceRoot,
                "index",
                "index.json"
            );

            if (!(await this.filesystem.exists(indexPath))) {
                throw new RelationshipAnalyzerError("index.json index file does not exist");
            }

            const indexData = await this.filesystem.readJson<{ files: any[] }>(indexPath);

            const relationships: RelationshipRecord[] = [];

            for (const file of indexData.files) {

                if (!file.path.endsWith(".ts") && !file.path.endsWith(".tsx")) {
                    continue;
                }

                const fullPath = path.join(this.projectRoot, file.path);
                const parsed = await this.parser.parse(fullPath);
                
                this.extractRelationships(
                    parsed.ast,
                    file.path,
                    projectSymbols,
                    relationships
                );

            }

            const result: RelationshipIndex = {
                generatedAt: new Date().toISOString(),
                relationships
            };

            await this.filesystem.writeJson(
                path.join(
                    this.workspaceRoot,
                    "index",
                    "relationships.json"
                ),
                result
            );

            return result;

        } catch (error: any) {

            if (error instanceof RelationshipAnalyzerError) {
                throw error;
            }

            throw new RelationshipAnalyzerError(`Failed to analyze relationships: ${error.message}`);

        }

    }

    private extractRelationships(
        sourceFile: ts.SourceFile,
        relativePath: string,
        projectSymbols: Set<string>,
        relationships: RelationshipRecord[]
    ): void {

        const scopeStack: string[] = [];

        const visit = (node: ts.Node) => {

            let pushed = false;

            if (ts.isClassDeclaration(node)) {

                const name = node.name?.text || "default";
                scopeStack.push(name);
                pushed = true;

                if (node.heritageClauses) {

                    for (const clause of node.heritageClauses) {

                        const type = clause.token === ts.SyntaxKind.ExtendsKeyword ? "extends" : "implements";

                        for (const typeNode of clause.types) {

                            const target = typeNode.expression.getText(sourceFile);
                            const line = sourceFile.getLineAndCharacterOfPosition(typeNode.getStart(sourceFile)).line + 1;

                            relationships.push({
                                source: scopeStack.join("."),
                                target,
                                type,
                                file: relativePath,
                                line
                            });

                        }

                    }

                }

            } else if (ts.isInterfaceDeclaration(node)) {

                const name = node.name.text;
                scopeStack.push(name);
                pushed = true;

                if (node.heritageClauses) {

                    for (const clause of node.heritageClauses) {

                        for (const typeNode of clause.types) {

                            const target = typeNode.expression.getText(sourceFile);
                            const line = sourceFile.getLineAndCharacterOfPosition(typeNode.getStart(sourceFile)).line + 1;

                            relationships.push({
                                source: scopeStack.join("."),
                                target,
                                type: "extends",
                                file: relativePath,
                                line
                            });

                        }

                    }

                }

            } else if (ts.isTypeAliasDeclaration(node)) {

                const name = node.name.text;
                scopeStack.push(name);
                pushed = true;

            } else if (ts.isEnumDeclaration(node)) {

                const name = node.name.text;
                scopeStack.push(name);
                pushed = true;

            } else if (ts.isFunctionDeclaration(node)) {

                const name = node.name?.text || "default";
                scopeStack.push(name);
                pushed = true;

            } else if (ts.isMethodDeclaration(node)) {

                const name = node.name.getText(sourceFile);
                scopeStack.push(name);
                pushed = true;

            } else if (ts.isConstructorDeclaration(node)) {

                scopeStack.push("constructor");
                pushed = true;

            } else if (ts.isPropertyDeclaration(node)) {

                const name = node.name.getText(sourceFile);
                scopeStack.push(name);
                pushed = true;

            } else if (ts.isVariableDeclaration(node)) {

                let isModuleLevel = false;

                if (node.parent && ts.isVariableDeclarationList(node.parent)) {

                    if (node.parent.parent && ts.isVariableStatement(node.parent.parent)) {

                        if (node.parent.parent.parent && ts.isSourceFile(node.parent.parent.parent)) {

                            isModuleLevel = true;

                        }

                    }

                }

                if (isModuleLevel) {

                    const name = node.name.getText(sourceFile);
                    scopeStack.push(name);
                    pushed = true;

                }

            }

            if (ts.isIdentifier(node)) {

                if (scopeStack.length > 0) {

                    const name = node.text;

                    if (projectSymbols.has(name)) {

                        let isDeclName = false;

                        if (node.parent) {

                            if (
                                (ts.isClassDeclaration(node.parent) ||
                                 ts.isInterfaceDeclaration(node.parent) ||
                                 ts.isTypeAliasDeclaration(node.parent) ||
                                 ts.isEnumDeclaration(node.parent) ||
                                 ts.isFunctionDeclaration(node.parent) ||
                                 ts.isMethodDeclaration(node.parent) ||
                                 ts.isPropertyDeclaration(node.parent) ||
                                 ts.isVariableDeclaration(node.parent) ||
                                 ts.isParameter(node.parent) ||
                                 ts.isImportSpecifier(node.parent) ||
                                 ts.isImportClause(node.parent) ||
                                 ts.isNamespaceImport(node.parent) ||
                                 ts.isExportSpecifier(node.parent)) &&
                                (node.parent as any).name === node
                            ) {

                                isDeclName = true;

                            }

                        }

                        if (!isDeclName) {

                            let isHeritage = false;
                            let current: ts.Node | undefined = node;

                            while (current && !ts.isClassDeclaration(current) && !ts.isInterfaceDeclaration(current)) {

                                if (current.kind === ts.SyntaxKind.HeritageClause) {

                                    isHeritage = true;
                                    break;

                                }

                                current = current.parent;

                            }

                            if (!isHeritage) {

                                const source = scopeStack.join(".");

                                if (source !== name) {

                                    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

                                    relationships.push({
                                        source,
                                        target: name,
                                        type: "references",
                                        file: relativePath,
                                        line
                                    });

                                }

                            }

                        }

                    }

                }

            }

            ts.forEachChild(node, visit);

            if (pushed) {

                scopeStack.pop();

            }

        };

        visit(sourceFile);

    }

}
