// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Snapshot Builder
// Assembles all normalized components into an immutable SemanticSnapshot.
// Token estimation is deterministic: Math.ceil(characters / 4).
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs/promises";
import path from "path";
import {
    SemanticSnapshot,
    SnapshotMetadata,
    SnapshotSection,
    SnapshotFile,
    SnapshotSymbol,
    SnapshotDependency,
    SnapshotRelationship,
    SnapshotGraph,
    SnapshotArchitectureEntry,
    SnapshotEvolutionEntry,
    SnapshotLearningEntry,
    SnapshotFingerprint,
    SnapshotContext
} from "./types.js";
import { SnapshotFingerprintEngine } from "./fingerprint.js";
import { SnapshotNormalizer } from "./normalizer.js";

const COMPILER_VERSION = "1.0.0";

export class SnapshotBuilder {
    private readonly fpEngine = new SnapshotFingerprintEngine();
    private readonly normalizer = new SnapshotNormalizer();

    build(params: {
        context: SnapshotContext;
        fingerprint: SnapshotFingerprint;
        files: SnapshotFile[];
        symbols: SnapshotSymbol[];
        dependencies: SnapshotDependency[];
        relationships: SnapshotRelationship[];
        graph: SnapshotGraph;
        architecture: SnapshotArchitectureEntry[];
        evolution: SnapshotEvolutionEntry[];
        learning: SnapshotLearningEntry[];
        compilationDurationMs: number;
        stageCount: number;
        incremental: boolean;
        parentSnapshotId?: string;
    }): SemanticSnapshot {
        const now = new Date().toISOString();

        // Build sections (ordered by priority ascending)
        const sections = this.buildSections(params);

        const totalTokens = sections.reduce((acc, s) => acc + s.estimatedTokens, 0);

        const metadata: SnapshotMetadata = {
            snapshotId: params.fingerprint.hash,
            projectRoot: params.context.projectRoot,
            workspaceRoot: params.context.workspaceRoot,
            createdAt: now,
            compiledAt: now,
            compilerVersion: COMPILER_VERSION,
            fingerprint: params.fingerprint,
            stageCount: params.stageCount,
            compilationDurationMs: params.compilationDurationMs,
            fileCount: params.files.length,
            symbolCount: params.symbols.length,
            dependencyEdgeCount: params.dependencies.length,
            graphNodeCount: params.graph.nodes.length,
            estimatedTokens: totalTokens,
            incremental: params.incremental,
            parentSnapshotId: params.parentSnapshotId
        };

        return {
            snapshotId: params.fingerprint.hash,
            metadata,
            sections,
            files: params.files,
            symbols: params.symbols,
            dependencies: params.dependencies,
            relationships: params.relationships,
            graph: params.graph,
            architecture: params.architecture,
            evolution: params.evolution,
            learning: params.learning,
            semanticMemory: this.extractSemanticMemory(params.context)
        };
    }

    // ─── Section Building ────────────────────────────────────────────────────

    private buildSections(params: {
        context: SnapshotContext;
        files: SnapshotFile[];
        symbols: SnapshotSymbol[];
        dependencies: SnapshotDependency[];
        relationships: SnapshotRelationship[];
        graph: SnapshotGraph;
        architecture: SnapshotArchitectureEntry[];
        evolution: SnapshotEvolutionEntry[];
        learning: SnapshotLearningEntry[];
    }): SnapshotSection[] {
        const sections: SnapshotSection[] = [];

        // Priority 10: Filesystem Index
        sections.push(this.makeSection({
            id: "filesystem-index",
            name: "Filesystem Index",
            kind: "filesystem-index",
            priority: 10,
            data: params.files.map(f => ({
                path: f.path,
                relativePath: f.relativePath,
                extension: f.extension,
                sizeBytes: f.sizeBytes,
                language: f.language,
                linesOfCode: f.linesOfCode
            })),
            sourcePaths: params.files.map(f => f.path)
        }));

        // Priority 20: Symbol Index
        sections.push(this.makeSection({
            id: "symbol-index",
            name: "Symbol Index",
            kind: "symbol-index",
            priority: 20,
            data: params.symbols.map(s => ({
                name: s.name,
                kind: s.kind,
                filePath: s.filePath,
                line: s.line,
                exported: s.exported
            })),
            sourcePaths: [...new Set(params.symbols.map(s => s.filePath))]
        }));

        // Priority 30: Architecture Memory
        sections.push(this.makeSection({
            id: "architecture-memory",
            name: "Architecture Memory",
            kind: "architecture-memory",
            priority: 30,
            data: params.architecture,
            sourcePaths: []
        }));

        // Priority 40: Knowledge Graph (Relationships)
        sections.push(this.makeSection({
            id: "knowledge-graph",
            name: "Knowledge Graph",
            kind: "knowledge-graph",
            priority: 40,
            data: params.relationships.slice(0, 500), // cap for token management
            sourcePaths: []
        }));

        // Priority 50: Dependency Graph
        sections.push(this.makeSection({
            id: "dependency-graph",
            name: "Dependency Graph",
            kind: "dependency-graph",
            priority: 50,
            data: params.dependencies.slice(0, 500),
            sourcePaths: [...new Set(params.dependencies.map(d => d.fromPath))]
        }));

        // Priority 60: Execution Graph
        sections.push(this.makeSection({
            id: "execution-graph",
            name: "Execution Graph",
            kind: "execution-graph",
            priority: 60,
            data: {
                nodes: params.graph.nodes.slice(0, 200),
                edges: params.graph.edges.slice(0, 200),
                topologicalOrder: params.graph.topologicalOrder.slice(0, 200)
            },
            sourcePaths: []
        }));

        // Priority 70: Repository Evolution
        sections.push(this.makeSection({
            id: "repository-evolution",
            name: "Repository Evolution",
            kind: "repository-evolution",
            priority: 70,
            data: params.evolution.slice(0, 100),
            sourcePaths: params.evolution.map(e => e.path)
        }));

        // Priority 80: Learning Summary
        sections.push(this.makeSection({
            id: "learning-summary",
            name: "Learning Summary",
            kind: "learning-summary",
            priority: 80,
            data: params.learning.slice(0, 50),
            sourcePaths: []
        }));

        // Sort by priority ascending (lowest first = highest priority)
        sections.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return a.id.localeCompare(b.id);
        });

        return sections;
    }

    private makeSection(opts: {
        id: string;
        name: string;
        kind: SnapshotSection["kind"];
        priority: number;
        data: any;
        sourcePaths: string[];
    }): SnapshotSection {
        const content = JSON.stringify(opts.data);
        const estimatedTokens = Math.ceil(content.length / 4);
        const contentHash = this.fpEngine.hashContent(content);
        return {
            id: opts.id,
            name: opts.name,
            kind: opts.kind,
            content,
            priority: opts.priority,
            contentHash,
            estimatedTokens,
            sourcePaths: opts.sourcePaths
        };
    }

    // ─── Data Extraction Helpers ─────────────────────────────────────────────

    extractFiles(context: SnapshotContext): SnapshotFile[] {
        const files: SnapshotFile[] = [];
        const filePaths = context.filePaths || [];

        // Build from index data when available (richer metadata)
        const indexItems: any[] = context.indexData
            ? (Array.isArray(context.indexData)
                ? context.indexData
                : Array.isArray(context.indexData.files)
                    ? context.indexData.files
                    : [])
            : [];

        const indexByPath = new Map<string, any>();
        for (const item of indexItems) {
            if (item && (item.path || item.filePath)) {
                indexByPath.set(item.path || item.filePath, item);
            }
        }

        for (const filePath of filePaths) {
            const idx = indexByPath.get(filePath);
            const relativePath = this.normalizer.normalizePath(
                filePath,
                context.workspaceRoot
            );
            const ext = path.extname(filePath).toLowerCase();
            files.push({
                path: filePath,
                relativePath,
                extension: ext,
                sizeBytes: idx?.sizeBytes || idx?.size || 0,
                linesOfCode: idx?.linesOfCode || idx?.lines || 0,
                language: idx?.language || this.inferLanguage(ext),
                lastModified: idx?.lastModified || idx?.mtime || new Date(0).toISOString(),
                contentHash: idx?.hash || idx?.contentHash || "",
                changeKind: "unchanged"
            });
        }

        return this.normalizer.normalizeFiles(files);
    }

    extractSymbols(context: SnapshotContext): SnapshotSymbol[] {
        const symbols: SnapshotSymbol[] = [];

        const symbolsData = context.symbolsData;
        if (!symbolsData) return symbols;

        const items: any[] = Array.isArray(symbolsData)
            ? symbolsData
            : Array.isArray(symbolsData.symbols)
                ? symbolsData.symbols
                : [];

        for (const item of items) {
            if (!item || typeof item !== "object") continue;
            const name = item.name || "";
            const filePath = item.filePath || item.path || item.file || "";
            if (!name || !filePath) continue;
            symbols.push({
                name,
                kind: this.resolveSymbolKind(item.kind || item.type),
                filePath,
                line: typeof item.line === "number" ? item.line : 0,
                exported: item.exported ?? item.isExported ?? false,
                contentHash: item.hash || item.contentHash || ""
            });
        }

        return this.normalizer.normalizeSymbols(symbols);
    }

    extractRelationships(context: SnapshotContext): SnapshotRelationship[] {
        const rels: SnapshotRelationship[] = [];

        const data = context.relationshipsData;
        if (!data) return rels;

        const items = Array.isArray(data)
            ? data
            : Array.isArray(data.relationships)
                ? data.relationships
                : null;

        if (items) {
            for (const item of items) {
                if (!item || typeof item !== "object") continue;
                const subject = item.source || item.subject || "";
                const object = item.target || item.object || "";
                const predicate = item.type || item.predicate || "references";
                if (!subject || !object) continue;
                rels.push({
                    subject,
                    predicate,
                    object,
                    weight: typeof item.weight === "number" ? item.weight : 1
                });
            }
        } else if (typeof data === "object") {
            for (const [subject, targets] of Object.entries(data)) {
                if (!Array.isArray(targets)) continue;
                for (const target of targets as any[]) {
                    const obj = typeof target === "string" ? target : (target.path || "");
                    if (!obj) continue;
                    rels.push({
                        subject: this.normalizer.normalizePath(subject, context.workspaceRoot),
                        predicate: "imports",
                        object: this.normalizer.normalizePath(obj, context.workspaceRoot),
                        weight: 1
                    });
                }
            }
        }

        return this.normalizer.normalizeRelationships(rels);
    }

    extractArchitecture(context: SnapshotContext): SnapshotArchitectureEntry[] {
        const raw = context.architectureData;
        const parsed: SnapshotArchitectureEntry[] = [];

        if (raw) {
            const entries: any[] = Array.isArray(raw)
                ? raw
                : Array.isArray(raw.entries)
                    ? raw.entries
                    : [];
            for (const e of entries) {
                if (!e || typeof e !== "object") continue;
                // Skip legacy stub-only entries
                if (e.title === "Legacy ADR entry") continue;
                parsed.push({
                    category: e.category || "General",
                    title: e.title || "",
                    description: e.description || "",
                    tags: Array.isArray(e.tags) ? e.tags : []
                });
            }
        }

        // Always augment with auto-generated structural entries from the project
        const generated = this.generateArchitectureFromContext(context);
        const result = [...parsed, ...generated];

        return this.normalizer.normalizeArchitecture(result);
    }

    private generateArchitectureFromContext(context: SnapshotContext): SnapshotArchitectureEntry[] {
        const entries: SnapshotArchitectureEntry[] = [];
        const filePaths = context.filePaths || [];

        // ── Language distribution ────────────────────────────────────────────
        const langCounts: Record<string, number> = {};
        for (const fp of filePaths) {
            const ext = fp.split(".").pop()?.toLowerCase() || "";
            const lang = this.inferLanguage("." + ext);
            if (lang !== "Unknown") langCounts[lang] = (langCounts[lang] || 0) + 1;
        }
        const topLangs = Object.entries(langCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([lang, count]) => `${lang} (${count} files)`)
            .join(", ");
        if (topLangs) {
            entries.push({
                category: "Language",
                title: "Primary Languages",
                description: topLangs,
                tags: Object.keys(langCounts).slice(0, 5)
            });
        }

        // ── Top-level directory structure ────────────────────────────────────
        const topDirs: Record<string, number> = {};
        for (const fp of filePaths) {
            const rel = fp.startsWith(context.projectRoot)
                ? fp.slice(context.projectRoot.length + 1)
                : fp;
            const parts = rel.split("/");
            if (parts.length > 1 && parts[0]) {
                const dir = parts[0];
                if (!["node_modules", ".git", ".brain", "dist", "build"].includes(dir)) {
                    topDirs[dir] = (topDirs[dir] || 0) + 1;
                }
            }
        }
        const topDirList = Object.entries(topDirs)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([dir, count]) => `${dir}/ (${count} files)`)
            .join(", ");
        if (topDirList) {
            entries.push({
                category: "Structure",
                title: "Top-level Directories",
                description: topDirList,
                tags: Object.keys(topDirs).slice(0, 8)
            });
        }

        // ── Packages (if monorepo-style) ─────────────────────────────────────
        const pkgDirs = new Set<string>();
        for (const fp of filePaths) {
            if (fp.includes("/packages/") || fp.includes("/apps/") || fp.includes("/libs/")) {
                const rel = fp.startsWith(context.projectRoot)
                    ? fp.slice(context.projectRoot.length + 1)
                    : fp;
                const parts = rel.split("/");
                const groupIdx = parts.findIndex(p => ["packages", "apps", "libs"].includes(p));
                if (groupIdx >= 0 && parts[groupIdx + 1]) {
                    pkgDirs.add(`${parts[groupIdx]}/${parts[groupIdx + 1]}`);
                }
            }
        }
        if (pkgDirs.size > 0) {
            entries.push({
                category: "Modules",
                title: "Packages / Modules",
                description: [...pkgDirs].sort().join(", "),
                tags: ["monorepo", "packages"]
            });
        }

        // ── Symbol summary ───────────────────────────────────────────────────
        const symbolsData = context.symbolsData;
        if (symbolsData) {
            const items: any[] = Array.isArray(symbolsData)
                ? symbolsData
                : Array.isArray(symbolsData.symbols) ? symbolsData.symbols : [];
            const kindCounts: Record<string, number> = {};
            for (const s of items) {
                const k = s?.kind || s?.type || "function";
                kindCounts[k] = (kindCounts[k] || 0) + 1;
            }
            const kindSummary = Object.entries(kindCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([k, n]) => `${n} ${k}s`)
                .join(", ");
            if (kindSummary) {
                entries.push({
                    category: "Symbols",
                    title: "Exported Symbol Types",
                    description: kindSummary,
                    tags: Object.keys(kindCounts).slice(0, 6)
                });
            }
        }

        // ── File count summary ───────────────────────────────────────────────
        if (filePaths.length > 0) {
            entries.push({
                category: "Overview",
                title: "Workspace Size",
                description: `${filePaths.length} tracked files across the workspace`,
                tags: ["overview", "size"]
            });
        }

        return entries;
    }


    extractEvolution(context: SnapshotContext): SnapshotEvolutionEntry[] {
        const raw = context.evolutionData;
        if (!raw) return [];
        const history: any[] = Array.isArray(raw)
            ? raw
            : Array.isArray(raw.fileHistory)
                ? raw.fileHistory
                : [];
        const result: SnapshotEvolutionEntry[] = [];
        for (const item of history) {
            if (!item || typeof item !== "object") continue;
            const p = item.path || item.file || "";
            if (!p) continue;
            result.push({
                path: p,
                changeCount: item.changeCount || item.commits || 1,
                lastChanged: item.lastChanged || item.lastModified || new Date(0).toISOString(),
                coChangedWith: item.coChangedWith || []
            });
        }
        return this.normalizer.normalizeEvolution(result);
    }

    extractLearning(context: SnapshotContext): SnapshotLearningEntry[] {
        const raw = context.learningData;
        if (!raw) return [];
        const experiences: any[] = Array.isArray(raw)
            ? raw
            : Array.isArray(raw.experiences)
                ? raw.experiences
                : [];
        const result: SnapshotLearningEntry[] = [];
        for (const exp of experiences) {
            if (!exp || typeof exp !== "object") continue;
            result.push({
                id: exp.id || "",
                taskType: exp.taskType || "",
                outcome: exp.outcome || "unknown",
                validationScore: exp.validationScore ?? 100,
                filesModified: Array.isArray(exp.filesModified) ? exp.filesModified : [],
                timestamp: exp.timestamp || new Date(0).toISOString()
            });
        }
        return this.normalizer.normalizeLearning(result);
    }

    // ─── Language Inference ──────────────────────────────────────────────────

    private inferLanguage(ext: string): string {
        const map: Record<string, string> = {
            ".ts": "TypeScript",
            ".tsx": "TypeScript",
            ".js": "JavaScript",
            ".jsx": "JavaScript",
            ".mjs": "JavaScript",
            ".py": "Python",
            ".go": "Go",
            ".rs": "Rust",
            ".java": "Java",
            ".cs": "C#",
            ".cpp": "C++",
            ".c": "C",
            ".rb": "Ruby",
            ".swift": "Swift",
            ".kt": "Kotlin",
            ".md": "Markdown",
            ".json": "JSON",
            ".yaml": "YAML",
            ".yml": "YAML",
            ".toml": "TOML",
            ".sh": "Shell",
            ".bash": "Shell"
        };
        return map[ext] || "Unknown";
    }

    private resolveSymbolKind(raw: string): SnapshotSymbol["kind"] {
        const lower = (raw || "").toLowerCase();
        if (lower.includes("class")) return "class";
        if (lower.includes("interface")) return "interface";
        if (lower.includes("type")) return "type";
        if (lower.includes("enum")) return "enum";
        if (lower.includes("namespace")) return "namespace";
        if (lower.includes("method")) return "method";
        if (lower.includes("prop")) return "property";
        if (lower.includes("const")) return "constant";
        if (lower.includes("var")) return "variable";
        return "function";
    }

    extractSemanticMemory(context: SnapshotContext): any[] {
        const raw = context.semanticMemoryData;
        if (!raw) return [];
        return Array.isArray(raw)
            ? raw
            : Array.isArray(raw.entries)
                ? raw.entries
                : [];
    }
}
