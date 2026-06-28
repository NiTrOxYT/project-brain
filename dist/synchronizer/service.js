import fs from "fs/promises";
import path from "path";
import { FileSystemService } from "../filesystem/index.js";
import { SymbolsService } from "../symbols/index.js";
import { ImportsService } from "../imports/index.js";
import { RelationshipAnalyzerService } from "../relationship-analyzer/index.js";
import { ExecutionGraphService } from "../execution-graph/index.js";
import { GraphBuilderService } from "../graph-builder/index.js";
import { RuntimeService } from "../runtime/index.js";
import { normalize } from "../semantic/index.js";
import { SynchronizerError } from "./errors.js";
export class SynchronizerService {
    filesystem = new FileSystemService();
    projectRoot;
    workspaceRoot;
    constructor(projectRoot, workspaceRoot) {
        this.projectRoot = projectRoot;
        this.workspaceRoot = workspaceRoot.endsWith(".brain") ? workspaceRoot : path.join(workspaceRoot, ".brain");
    }
    async forceRebuild() {
        try {
            const runtime = new RuntimeService({
                root: this.projectRoot
            });
            await runtime.initialize();
        }
        catch (error) {
            throw new SynchronizerError(`Force rebuild failed: ${error.message}`);
        }
    }
    async synchronize() {
        try {
            const indexPath = path.join(this.workspaceRoot, "index", "index.json");
            if (!(await this.filesystem.exists(indexPath))) {
                // If index file does not exist, trigger a full rebuild first
                await this.forceRebuild();
            }
            const existingIndex = await this.filesystem.readJson(indexPath);
            const existingFilesMap = new Map();
            for (const file of existingIndex.files) {
                existingFilesMap.set(file.path, file);
            }
            const currentFilesMap = await this.scanProject();
            const addedFiles = [];
            const removedFiles = [];
            const changedFiles = [];
            for (const [relPath, curFile] of currentFilesMap.entries()) {
                const extFile = existingFilesMap.get(relPath);
                if (!extFile) {
                    addedFiles.push(relPath);
                }
                else if (extFile.size !== curFile.size ||
                    new Date(extFile.modifiedAt).getTime() !== new Date(curFile.modifiedAt).getTime()) {
                    changedFiles.push(relPath);
                }
            }
            for (const relPath of existingFilesMap.keys()) {
                if (!currentFilesMap.has(relPath)) {
                    removedFiles.push(relPath);
                }
            }
            const stateDir = path.join(this.workspaceRoot, "sync");
            const statePath = path.join(stateDir, "state.json");
            // Cache hit: nothing changed
            if (addedFiles.length === 0 && removedFiles.length === 0 && changedFiles.length === 0) {
                const state = {
                    generatedAt: new Date().toISOString(),
                    scannedFiles: currentFilesMap.size,
                    changedFiles: [],
                    addedFiles: [],
                    removedFiles: [],
                    updatedIndexes: []
                };
                if (!(await this.filesystem.exists(stateDir))) {
                    await this.filesystem.mkdir(stateDir);
                }
                await this.filesystem.writeJson(statePath, state);
                return state;
            }
            const updatedIndexes = [];
            // 1. Update index.json
            const updatedFiles = [...currentFilesMap.values()];
            await this.filesystem.writeJson(indexPath, { files: updatedFiles });
            updatedIndexes.push("index.json");
            const affectedSet = new Set([...changedFiles, ...removedFiles]);
            const newlyAddedOrChanged = [...addedFiles, ...changedFiles];
            // 2. Update symbols.json
            const symbolsPath = path.join(this.workspaceRoot, "index", "symbols.json");
            let symbolsList = [];
            if (await this.filesystem.exists(symbolsPath)) {
                const symbolsData = await this.filesystem.readJson(symbolsPath);
                symbolsList = symbolsData.symbols.filter(sym => !affectedSet.has(sym.file));
            }
            const symbolsService = new SymbolsService(this.projectRoot, this.workspaceRoot);
            const addedSymbols = [];
            for (const relPath of newlyAddedOrChanged) {
                const ext = path.extname(relPath).toLowerCase();
                if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") {
                    const fileSyms = await symbolsService.extractFromFile(relPath);
                    addedSymbols.push(...fileSyms);
                }
            }
            symbolsList.push(...addedSymbols);
            await this.filesystem.writeJson(symbolsPath, {
                generatedAt: new Date().toISOString(),
                symbols: symbolsList
            });
            updatedIndexes.push("symbols.json");
            // 3. Update imports.json
            const importsPath = path.join(this.workspaceRoot, "index", "imports.json");
            let importsList = [];
            if (await this.filesystem.exists(importsPath)) {
                const importsData = await this.filesystem.readJson(importsPath);
                importsList = importsData.imports.filter(imp => !affectedSet.has(imp.source));
            }
            const importsService = new ImportsService(this.projectRoot, this.workspaceRoot);
            const addedImports = [];
            for (const relPath of newlyAddedOrChanged) {
                const ext = path.extname(relPath).toLowerCase();
                if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") {
                    const fileImps = await importsService.extractFromFile(relPath);
                    addedImports.push(...fileImps);
                }
            }
            importsList.push(...addedImports);
            await this.filesystem.writeJson(importsPath, {
                generatedAt: new Date().toISOString(),
                imports: importsList
            });
            updatedIndexes.push("imports.json");
            // 4. Update relationships.json
            const relationshipsPath = path.join(this.workspaceRoot, "index", "relationships.json");
            let relationshipsList = [];
            if (await this.filesystem.exists(relationshipsPath)) {
                const relData = await this.filesystem.readJson(relationshipsPath);
                relationshipsList = relData.relationships.filter(rel => !affectedSet.has(rel.file));
            }
            const relService = new RelationshipAnalyzerService(this.projectRoot, this.workspaceRoot);
            const projectSymbols = new Set(symbolsList.map(s => s.name));
            const addedRelationships = [];
            for (const relPath of newlyAddedOrChanged) {
                const ext = path.extname(relPath).toLowerCase();
                if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") {
                    const fileRels = await relService.extractFromFile(relPath, projectSymbols);
                    addedRelationships.push(...fileRels);
                }
            }
            relationshipsList.push(...addedRelationships);
            await this.filesystem.writeJson(relationshipsPath, {
                generatedAt: new Date().toISOString(),
                relationships: relationshipsList
            });
            updatedIndexes.push("relationships.json");
            // 5. Update execution-graph.json (Incremental execution graph build)
            const execService = new ExecutionGraphService(this.workspaceRoot);
            await execService.buildIncremental(newlyAddedOrChanged, removedFiles);
            updatedIndexes.push("execution-graph.json");
            // 6. Update graph.json (Rebuild dependency graph)
            const graphService = new GraphBuilderService(this.workspaceRoot);
            await graphService.build();
            updatedIndexes.push("graph.json");
            // 7. Update semantic.json
            const semanticPath = path.join(this.workspaceRoot, "index", "semantic.json");
            let semanticEntries = [];
            if (await this.filesystem.exists(semanticPath)) {
                const semanticData = await this.filesystem.readJson(semanticPath);
                semanticEntries = semanticData.entries.filter(entry => !affectedSet.has(entry.file));
            }
            for (const sym of addedSymbols) {
                const terms = normalize(sym.name);
                semanticEntries.push({
                    id: sym.file + "::" + sym.name,
                    file: sym.file,
                    terms,
                    weight: 100
                });
            }
            await this.filesystem.writeJson(semanticPath, {
                generatedAt: new Date().toISOString(),
                entries: semanticEntries
            });
            updatedIndexes.push("semantic.json");
            const state = {
                generatedAt: new Date().toISOString(),
                scannedFiles: currentFilesMap.size,
                changedFiles,
                addedFiles,
                removedFiles,
                updatedIndexes
            };
            if (!(await this.filesystem.exists(stateDir))) {
                await this.filesystem.mkdir(stateDir);
            }
            await this.filesystem.writeJson(statePath, state);
            return state;
        }
        catch (error) {
            if (error instanceof SynchronizerError) {
                throw error;
            }
            throw new SynchronizerError(`Synchronization failed: ${error.message}`);
        }
    }
    async scanProject() {
        const filesMap = new Map();
        const walk = async (dir) => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === ".git" ||
                    entry.name === ".brain" ||
                    entry.name === "node_modules" ||
                    entry.name === "dist") {
                    continue;
                }
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await walk(fullPath);
                }
                else {
                    const stat = await fs.stat(fullPath);
                    const relPath = path.relative(this.projectRoot, fullPath);
                    filesMap.set(relPath, {
                        path: relPath,
                        extension: path.extname(fullPath),
                        size: stat.size,
                        modifiedAt: stat.mtime.toISOString()
                    });
                }
            }
        };
        await walk(this.projectRoot);
        return filesMap;
    }
}
