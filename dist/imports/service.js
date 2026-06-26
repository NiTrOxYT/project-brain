import fs from "fs/promises";
import path from "path";
import ts from "typescript";
import { AstService } from "../ast";
import { FileSystemService } from "../filesystem";
export class ImportsService {
    projectRoot;
    workspaceRoot;
    filesystem = new FileSystemService();
    parser = new AstService();
    constructor(projectRoot, workspaceRoot) {
        this.projectRoot = projectRoot;
        this.workspaceRoot = workspaceRoot;
    }
    async index() {
        const imports = [];
        await this.walk(this.projectRoot, imports);
        const index = {
            generatedAt: new Date().toISOString(),
            imports
        };
        await this.filesystem.writeJson(path.join(this.workspaceRoot, "index", "imports.json"), index);
        return index;
    }
    async walk(directory, output) {
        const entries = await fs.readdir(directory, {
            withFileTypes: true
        });
        for (const entry of entries) {
            if (entry.name === ".git" ||
                entry.name === ".brain" ||
                entry.name === "node_modules" ||
                entry.name === "dist") {
                continue;
            }
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                await this.walk(fullPath, output);
                continue;
            }
            if (!fullPath.endsWith(".ts") &&
                !fullPath.endsWith(".tsx")) {
                continue;
            }
            const parsed = await this.parser.parse(fullPath);
            this.extract(parsed.ast, fullPath, output);
        }
    }
    extract(source, file, output) {
        const visit = (node) => {
            //
            // import ... from "..."
            // import "./x"
            //
            if (ts.isImportDeclaration(node)) {
                if (ts.isStringLiteral(node.moduleSpecifier)) {
                    output.push({
                        source: path.relative(this.projectRoot, file),
                        target: node.moduleSpecifier.text
                    });
                }
            }
            //
            // export ... from "..."
            // export * from "..."
            //
            else if (ts.isExportDeclaration(node)) {
                if (node.moduleSpecifier &&
                    ts.isStringLiteral(node.moduleSpecifier)) {
                    output.push({
                        source: path.relative(this.projectRoot, file),
                        target: node.moduleSpecifier.text
                    });
                }
            }
            //
            // dynamic import("...")
            //
            else if (ts.isCallExpression(node)) {
                if (node.expression.kind ===
                    ts.SyntaxKind.ImportKeyword &&
                    node.arguments.length === 1) {
                    const arg = node.arguments[0];
                    if (ts.isStringLiteral(arg)) {
                        output.push({
                            source: path.relative(this.projectRoot, file),
                            target: arg.text
                        });
                    }
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
}
