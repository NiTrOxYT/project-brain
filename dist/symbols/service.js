import fs from "fs/promises";
import path from "path";
import ts from "typescript";
import { AstService } from "../ast";
import { FileSystemService } from "../filesystem";
export class SymbolsService {
    projectRoot;
    workspaceRoot;
    filesystem = new FileSystemService();
    parser = new AstService();
    constructor(projectRoot, workspaceRoot) {
        this.projectRoot = projectRoot;
        this.workspaceRoot = workspaceRoot;
    }
    async extractFromFile(relativePath) {
        const fullPath = path.join(this.projectRoot, relativePath);
        const parsed = await this.parser.parse(fullPath);
        const output = [];
        this.extract(parsed.ast, fullPath, output);
        return output;
    }
    async index() {
        const symbols = [];
        await this.walk(this.projectRoot, symbols);
        const index = {
            generatedAt: new Date().toISOString(),
            symbols
        };
        await this.filesystem.writeJson(path.join(this.workspaceRoot, "index", "symbols.json"), index);
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
            let kind;
            let name;
            if (ts.isClassDeclaration(node)) {
                kind = "class";
                name = node.name?.text;
            }
            else if (ts.isInterfaceDeclaration(node)) {
                kind = "interface";
                name = node.name.text;
            }
            else if (ts.isTypeAliasDeclaration(node)) {
                kind = "type";
                name = node.name.text;
            }
            else if (ts.isEnumDeclaration(node)) {
                kind = "enum";
                name = node.name.text;
            }
            else if (ts.isFunctionDeclaration(node)) {
                kind = "function";
                name = node.name?.text;
            }
            else if (ts.isMethodDeclaration(node)) {
                kind = "method";
                name = node.name.getText(source);
            }
            else if (ts.isConstructorDeclaration(node)) {
                kind = "constructor";
                name = "constructor";
            }
            else if (ts.isPropertyDeclaration(node)) {
                kind = "property";
                name = node.name.getText(source);
            }
            else if (ts.isVariableDeclaration(node)) {
                kind = "variable";
                if (ts.isIdentifier(node.name)) {
                    name = node.name.text;
                }
            }
            if (kind &&
                name) {
                const position = source.getLineAndCharacterOfPosition(node.getStart());
                output.push({
                    name,
                    kind,
                    file: path.relative(this.projectRoot, file),
                    line: position.line + 1
                });
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
}
