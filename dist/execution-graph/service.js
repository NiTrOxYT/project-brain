import fs from "fs/promises";
import path from "path";
import ts from "typescript";
import { AstService } from "../ast/index.js";
import { FileSystemService } from "../filesystem/index.js";
import { ExecutionGraphError } from "./errors.js";
export class ExecutionGraphService {
    workspaceRoot;
    filesystem = new FileSystemService();
    parser = new AstService();
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    async getProjectRoot() {
        try {
            let configPath = path.join(this.workspaceRoot, "brain.json");
            if (!(await this.filesystem.exists(configPath))) {
                configPath = path.join(this.workspaceRoot, ".brain", "brain.json");
            }
            const raw = await fs.readFile(configPath, "utf8");
            const config = JSON.parse(raw);
            if (config.projectRoot) {
                return config.projectRoot;
            }
        }
        catch { }
        return this.workspaceRoot.endsWith(".brain") ? path.dirname(this.workspaceRoot) : this.workspaceRoot;
    }
    async build() {
        try {
            const projectRoot = await this.getProjectRoot();
            const indexPath = path.join(this.workspaceRoot, "index", "index.json");
            if (!(await this.filesystem.exists(indexPath))) {
                throw new ExecutionGraphError("index.json file does not exist");
            }
            const indexData = await this.filesystem.readJson(indexPath);
            const tsFiles = indexData.files
                .filter(file => file.path.endsWith(".ts") || file.path.endsWith(".tsx"))
                .map(file => file.path);
            // Import Resolution & Reachability Setup
            const { ImportResolverService } = await import("../import-resolver/index.js");
            const resolvedImports = await new ImportResolverService(this.workspaceRoot).resolve();
            const importsMap = new Map();
            for (const imp of resolvedImports) {
                if (imp.resolved) {
                    if (!importsMap.has(imp.source)) {
                        importsMap.set(imp.source, new Set());
                    }
                    importsMap.get(imp.source).add(imp.target);
                }
            }
            const transitiveImports = new Map();
            for (const file of tsFiles) {
                const visited = new Set();
                const dfs = (f) => {
                    if (visited.has(f))
                        return;
                    visited.add(f);
                    const targets = importsMap.get(f) || new Set();
                    for (const t of targets) {
                        dfs(t);
                    }
                };
                dfs(file);
                transitiveImports.set(file, visited);
            }
            // PASS 1: Discovery of Defined Symbols & Qualified Names
            const definedSymbols = new Map();
            const simpleNameMap = new Map();
            const registerSymbol = (qualifiedName, file, kind) => {
                const info = { qualifiedName, file, kind };
                definedSymbols.set(`${file}#${qualifiedName}`, info);
                const lastPart = qualifiedName.split(".").pop() || qualifiedName;
                if (!simpleNameMap.has(lastPart)) {
                    simpleNameMap.set(lastPart, []);
                }
                simpleNameMap.get(lastPart).push(info);
            };
            for (const filePath of tsFiles) {
                const fullPath = path.join(projectRoot, filePath);
                const parsed = await this.parser.parse(fullPath);
                const scopeStack = [];
                const visitDiscovery = (node) => {
                    let pushed = false;
                    let kind = "";
                    let name = "";
                    if (ts.isClassDeclaration(node)) {
                        kind = "class";
                        name = node.name?.text || "default";
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
                        name = node.name?.text || "default";
                    }
                    else if (ts.isMethodDeclaration(node)) {
                        kind = "method";
                        name = node.name.getText(parsed.ast);
                    }
                    else if (ts.isConstructorDeclaration(node)) {
                        kind = "constructor";
                        name = "constructor";
                    }
                    else if (ts.isPropertyDeclaration(node)) {
                        kind = "property";
                        name = node.name.getText(parsed.ast);
                    }
                    else if (ts.isVariableDeclaration(node)) {
                        let isModuleLevel = false;
                        if (node.parent && ts.isVariableDeclarationList(node.parent)) {
                            if (node.parent.parent && ts.isVariableStatement(node.parent.parent)) {
                                if (node.parent.parent.parent && ts.isSourceFile(node.parent.parent.parent)) {
                                    isModuleLevel = true;
                                }
                            }
                        }
                        if (isModuleLevel) {
                            kind = "variable";
                            name = node.name.getText(parsed.ast);
                        }
                    }
                    if (name && kind) {
                        scopeStack.push(name);
                        pushed = true;
                        registerSymbol(scopeStack.join("."), filePath, kind);
                    }
                    ts.forEachChild(node, visitDiscovery);
                    if (pushed) {
                        scopeStack.pop();
                    }
                };
                visitDiscovery(parsed.ast);
            }
            // PASS 2: Traversal & Extraction of Execution Flows
            const nodes = new Map();
            const edges = [];
            const resolveTarget = (targetName, sourceFile) => {
                const candidates = simpleNameMap.get(targetName);
                if (!candidates || candidates.length === 0) {
                    return null;
                }
                // 1. Local check
                const local = candidates.find(c => c.file === sourceFile);
                if (local)
                    return local;
                // 2. Transitive import check
                const imported = candidates.find(c => {
                    const set = transitiveImports.get(sourceFile);
                    return set ? set.has(c.file) : false;
                });
                if (imported)
                    return imported;
                // 3. Fallback to single candidate
                if (candidates.length === 1) {
                    return candidates[0];
                }
                return null;
            };
            for (const filePath of tsFiles) {
                const fullPath = path.join(projectRoot, filePath);
                const parsed = await this.parser.parse(fullPath);
                const scopeStack = [];
                const kindStack = [];
                const getActiveScopeId = () => {
                    if (scopeStack.length === 0)
                        return null;
                    return `${filePath}#${scopeStack.join(".")}`;
                };
                const visitAnalysis = (node) => {
                    let pushed = false;
                    let kind = "";
                    let name = "";
                    if (ts.isClassDeclaration(node)) {
                        kind = "class";
                        name = node.name?.text || "default";
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
                        name = node.name?.text || "default";
                    }
                    else if (ts.isMethodDeclaration(node)) {
                        kind = "method";
                        name = node.name.getText(parsed.ast);
                    }
                    else if (ts.isConstructorDeclaration(node)) {
                        kind = "constructor";
                        name = "constructor";
                    }
                    else if (ts.isPropertyDeclaration(node)) {
                        kind = "property";
                        name = node.name.getText(parsed.ast);
                    }
                    else if (ts.isVariableDeclaration(node)) {
                        let isModuleLevel = false;
                        if (node.parent && ts.isVariableDeclarationList(node.parent)) {
                            if (node.parent.parent && ts.isVariableStatement(node.parent.parent)) {
                                if (node.parent.parent.parent && ts.isSourceFile(node.parent.parent.parent)) {
                                    isModuleLevel = true;
                                }
                            }
                        }
                        if (isModuleLevel) {
                            kind = "variable";
                            name = node.name.getText(parsed.ast);
                        }
                    }
                    if (name && kind) {
                        scopeStack.push(name);
                        kindStack.push(kind);
                        pushed = true;
                        const activeId = getActiveScopeId();
                        if (!nodes.has(activeId)) {
                            nodes.set(activeId, {
                                id: activeId,
                                symbol: scopeStack.join("."),
                                file: filePath,
                                kind
                            });
                        }
                    }
                    // Execution target tracking helpers
                    const addEdge = (targetName, type) => {
                        const fromId = getActiveScopeId();
                        if (!fromId)
                            return;
                        const resolved = resolveTarget(targetName, filePath);
                        let toId = "";
                        if (resolved) {
                            toId = `${resolved.file}#${resolved.qualifiedName}`;
                            if (!nodes.has(toId)) {
                                nodes.set(toId, {
                                    id: toId,
                                    symbol: resolved.qualifiedName,
                                    file: resolved.file,
                                    kind: resolved.kind
                                });
                            }
                        }
                        else {
                            toId = `external#${targetName}`;
                            if (!nodes.has(toId)) {
                                nodes.set(toId, {
                                    id: toId,
                                    symbol: targetName,
                                    file: "external",
                                    kind: "external"
                                });
                            }
                        }
                        // Deduplicate edges
                        const exists = edges.some(e => e.from === fromId && e.to === toId && e.type === type);
                        if (!exists && fromId !== toId) {
                            edges.push({ from: fromId, to: toId, type });
                        }
                    };
                    if (ts.isNewExpression(node)) {
                        const targetName = node.expression.getText(parsed.ast);
                        addEdge(targetName, "constructs");
                    }
                    else if (ts.isCallExpression(node)) {
                        let targetName = "";
                        if (ts.isIdentifier(node.expression)) {
                            targetName = node.expression.text;
                        }
                        else if (ts.isPropertyAccessExpression(node.expression)) {
                            targetName = node.expression.name.text;
                        }
                        else {
                            targetName = node.expression.getText(parsed.ast);
                        }
                        addEdge(targetName, "calls");
                    }
                    else if (ts.isAwaitExpression(node)) {
                        let targetName = "";
                        let inner = node.expression;
                        if (ts.isCallExpression(inner) || ts.isNewExpression(inner)) {
                            const callee = inner.expression;
                            if (callee) {
                                if (ts.isIdentifier(callee)) {
                                    targetName = callee.text;
                                }
                                else if (ts.isPropertyAccessExpression(callee)) {
                                    targetName = callee.name.text;
                                }
                                else {
                                    targetName = callee.getText(parsed.ast);
                                }
                            }
                        }
                        if (!targetName) {
                            targetName = inner.getText(parsed.ast);
                        }
                        addEdge(targetName, "awaits");
                    }
                    ts.forEachChild(node, visitAnalysis);
                    if (pushed) {
                        scopeStack.pop();
                        kindStack.pop();
                    }
                };
                visitAnalysis(parsed.ast);
            }
            const graph = {
                generatedAt: new Date().toISOString(),
                nodes: [...nodes.values()],
                edges
            };
            const graphDirPath = path.join(this.workspaceRoot, "index");
            if (!(await this.filesystem.exists(graphDirPath))) {
                await this.filesystem.mkdir(graphDirPath);
            }
            await this.filesystem.writeJson(path.join(graphDirPath, "execution-graph.json"), graph);
            return graph;
        }
        catch (error) {
            if (error instanceof ExecutionGraphError) {
                throw error;
            }
            throw new ExecutionGraphError(`Failed to build execution graph: ${error.message}`);
        }
    }
    async buildIncremental(changedFiles, removedFiles) {
        try {
            const projectRoot = await this.getProjectRoot();
            const graphPath = path.join(this.workspaceRoot, "index", "execution-graph.json");
            if (!(await this.filesystem.exists(graphPath))) {
                return this.build();
            }
            const existingGraph = await this.filesystem.readJson(graphPath);
            const affectedSet = new Set([...changedFiles, ...removedFiles]);
            const nodesMap = new Map();
            for (const node of existingGraph.nodes) {
                if (!affectedSet.has(node.file)) {
                    nodesMap.set(node.id, node);
                }
            }
            const edges = [];
            for (const edge of existingGraph.edges) {
                const fromFile = edge.from.split("#")[0];
                const toFile = edge.to.split("#")[0];
                if (!affectedSet.has(fromFile) && !affectedSet.has(toFile)) {
                    edges.push(edge);
                }
            }
            const indexPath = path.join(this.workspaceRoot, "index", "index.json");
            if (!(await this.filesystem.exists(indexPath))) {
                throw new ExecutionGraphError("index.json file does not exist");
            }
            const indexData = await this.filesystem.readJson(indexPath);
            const tsFiles = indexData.files
                .filter(file => file.path.endsWith(".ts") || file.path.endsWith(".tsx"))
                .map(file => file.path);
            const { ImportResolverService } = await import("../import-resolver/index.js");
            const resolvedImports = await new ImportResolverService(this.workspaceRoot).resolve();
            const importsMap = new Map();
            for (const imp of resolvedImports) {
                if (imp.resolved) {
                    if (!importsMap.has(imp.source)) {
                        importsMap.set(imp.source, new Set());
                    }
                    importsMap.get(imp.source).add(imp.target);
                }
            }
            const transitiveImports = new Map();
            for (const file of tsFiles) {
                const visited = new Set();
                const dfs = (f) => {
                    if (visited.has(f))
                        return;
                    visited.add(f);
                    const targets = importsMap.get(f) || new Set();
                    for (const t of targets) {
                        dfs(t);
                    }
                };
                dfs(file);
                transitiveImports.set(file, visited);
            }
            const definedSymbols = new Map();
            const simpleNameMap = new Map();
            const registerSymbol = (qualifiedName, file, kind) => {
                const info = { qualifiedName, file, kind };
                definedSymbols.set(`${file}#${qualifiedName}`, info);
                const lastPart = qualifiedName.split(".").pop() || qualifiedName;
                if (!simpleNameMap.has(lastPart)) {
                    simpleNameMap.set(lastPart, []);
                }
                simpleNameMap.get(lastPart).push(info);
            };
            for (const filePath of tsFiles) {
                const fullPath = path.join(projectRoot, filePath);
                const parsed = await this.parser.parse(fullPath);
                const scopeStack = [];
                const visitDiscovery = (node) => {
                    let pushed = false;
                    let kind = "";
                    let name = "";
                    if (ts.isClassDeclaration(node)) {
                        kind = "class";
                        name = node.name?.text || "default";
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
                        name = node.name?.text || "default";
                    }
                    else if (ts.isMethodDeclaration(node)) {
                        kind = "method";
                        name = node.name.getText(parsed.ast);
                    }
                    else if (ts.isConstructorDeclaration(node)) {
                        kind = "constructor";
                        name = "constructor";
                    }
                    else if (ts.isPropertyDeclaration(node)) {
                        kind = "property";
                        name = node.name.getText(parsed.ast);
                    }
                    else if (ts.isVariableDeclaration(node)) {
                        let isModuleLevel = false;
                        if (node.parent && ts.isVariableDeclarationList(node.parent)) {
                            if (node.parent.parent && ts.isVariableStatement(node.parent.parent)) {
                                if (node.parent.parent.parent && ts.isSourceFile(node.parent.parent.parent)) {
                                    isModuleLevel = true;
                                }
                            }
                        }
                        if (isModuleLevel) {
                            kind = "variable";
                            name = node.name.getText(parsed.ast);
                        }
                    }
                    if (name && kind) {
                        scopeStack.push(name);
                        pushed = true;
                        registerSymbol(scopeStack.join("."), filePath, kind);
                    }
                    ts.forEachChild(node, visitDiscovery);
                    if (pushed) {
                        scopeStack.pop();
                    }
                };
                visitDiscovery(parsed.ast);
            }
            const resolveTarget = (targetName, sourceFile) => {
                const candidates = simpleNameMap.get(targetName);
                if (!candidates || candidates.length === 0) {
                    return null;
                }
                const local = candidates.find(c => c.file === sourceFile);
                if (local)
                    return local;
                const imported = candidates.find(c => {
                    const set = transitiveImports.get(sourceFile);
                    return set ? set.has(c.file) : false;
                });
                if (imported)
                    return imported;
                if (candidates.length === 1) {
                    return candidates[0];
                }
                return null;
            };
            for (const filePath of changedFiles) {
                const fullPath = path.join(projectRoot, filePath);
                const parsed = await this.parser.parse(fullPath);
                const scopeStack = [];
                const kindStack = [];
                const getActiveScopeId = () => {
                    if (scopeStack.length === 0)
                        return null;
                    return `${filePath}#${scopeStack.join(".")}`;
                };
                const visitAnalysis = (node) => {
                    let pushed = false;
                    let kind = "";
                    let name = "";
                    if (ts.isClassDeclaration(node)) {
                        kind = "class";
                        name = node.name?.text || "default";
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
                        name = node.name?.text || "default";
                    }
                    else if (ts.isMethodDeclaration(node)) {
                        kind = "method";
                        name = node.name.getText(parsed.ast);
                    }
                    else if (ts.isConstructorDeclaration(node)) {
                        kind = "constructor";
                        name = "constructor";
                    }
                    else if (ts.isPropertyDeclaration(node)) {
                        kind = "property";
                        name = node.name.getText(parsed.ast);
                    }
                    else if (ts.isVariableDeclaration(node)) {
                        let isModuleLevel = false;
                        if (node.parent && ts.isVariableDeclarationList(node.parent)) {
                            if (node.parent.parent && ts.isVariableStatement(node.parent.parent)) {
                                if (node.parent.parent.parent && ts.isSourceFile(node.parent.parent.parent)) {
                                    isModuleLevel = true;
                                }
                            }
                        }
                        if (isModuleLevel) {
                            kind = "variable";
                            name = node.name.getText(parsed.ast);
                        }
                    }
                    if (name && kind) {
                        scopeStack.push(name);
                        kindStack.push(kind);
                        pushed = true;
                        const activeId = getActiveScopeId();
                        if (!nodesMap.has(activeId)) {
                            nodesMap.set(activeId, {
                                id: activeId,
                                symbol: scopeStack.join("."),
                                file: filePath,
                                kind
                            });
                        }
                    }
                    const addEdge = (targetName, type) => {
                        const fromId = getActiveScopeId();
                        if (!fromId)
                            return;
                        const resolved = resolveTarget(targetName, filePath);
                        let toId = "";
                        if (resolved) {
                            toId = `${resolved.file}#${resolved.qualifiedName}`;
                            if (!nodesMap.has(toId)) {
                                nodesMap.set(toId, {
                                    id: toId,
                                    symbol: resolved.qualifiedName,
                                    file: resolved.file,
                                    kind: resolved.kind
                                });
                            }
                        }
                        else {
                            toId = `external#${targetName}`;
                            if (!nodesMap.has(toId)) {
                                nodesMap.set(toId, {
                                    id: toId,
                                    symbol: targetName,
                                    file: "external",
                                    kind: "external"
                                });
                            }
                        }
                        const exists = edges.some(e => e.from === fromId && e.to === toId && e.type === type);
                        if (!exists && fromId !== toId) {
                            edges.push({ from: fromId, to: toId, type });
                        }
                    };
                    if (ts.isNewExpression(node)) {
                        const targetName = node.expression.getText(parsed.ast);
                        addEdge(targetName, "constructs");
                    }
                    else if (ts.isCallExpression(node)) {
                        let targetName = "";
                        if (ts.isIdentifier(node.expression)) {
                            targetName = node.expression.text;
                        }
                        else if (ts.isPropertyAccessExpression(node.expression)) {
                            targetName = node.expression.name.text;
                        }
                        else {
                            targetName = node.expression.getText(parsed.ast);
                        }
                        addEdge(targetName, "calls");
                    }
                    else if (ts.isAwaitExpression(node)) {
                        let targetName = "";
                        let inner = node.expression;
                        if (ts.isCallExpression(inner) || ts.isNewExpression(inner)) {
                            const callee = inner.expression;
                            if (callee) {
                                if (ts.isIdentifier(callee)) {
                                    targetName = callee.text;
                                }
                                else if (ts.isPropertyAccessExpression(callee)) {
                                    targetName = callee.name.text;
                                }
                                else {
                                    targetName = callee.getText(parsed.ast);
                                }
                            }
                        }
                        if (!targetName) {
                            targetName = inner.getText(parsed.ast);
                        }
                        addEdge(targetName, "awaits");
                    }
                    ts.forEachChild(node, visitAnalysis);
                    if (pushed) {
                        scopeStack.pop();
                        kindStack.pop();
                    }
                };
                visitAnalysis(parsed.ast);
            }
            const graph = {
                generatedAt: new Date().toISOString(),
                nodes: [...nodesMap.values()],
                edges
            };
            await this.filesystem.writeJson(graphPath, graph);
            return graph;
        }
        catch (error) {
            if (error instanceof ExecutionGraphError) {
                throw error;
            }
            throw new ExecutionGraphError(`Failed to build execution graph incrementally: ${error.message}`);
        }
    }
}
